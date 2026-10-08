// 학교 정보 중계: NEIS 학사일정 + 학교알리미 학년별·학급별 학생 수(조사항목 09)
// 키는 버셀 환경 변수(NEIS_KEY, SCHOOLINFO_KEY)에서만 읽고, 응답에는 절대 넣지 않는다.
// 정해 둔 학교만 조회한다 — 다른 사람이 이 주소로 키를 마음대로 쓰지 못하게.

const REGION = { neis: 'J10', sido: '41', sgg: '41273' }; // 경기도교육청 · 경기 안산시 단원구
export const SCHOOLS = {
  고잔초: { full: '고잔초등학교', neis: '7611036', kind: '02' },
  와동초: { full: '와동초등학교', neis: '7611068', kind: '02' },
  선부초: { full: '선부초등학교', neis: '7611051', kind: '02' },
  단원중: { full: '단원중학교', neis: '7611120', kind: '03' },
  와동중: { full: '와동중학교', neis: '7611022', kind: '03' },
};
const DAYS = 120;
const EXAM = /고사|시험|평가/;

const ymd = d => d.toISOString().slice(0, 10).replace(/-/g, '');
const n = v => (v == null || v === '' ? null : Number(v));

async function getJson(fetchFn, url) {
  const r = await fetchFn(url, { headers: { 'User-Agent': 'academy-records' } });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}

async function schedule(fetchFn, key, sch, from) {
  const to = new Date(from.getTime() + DAYS * 864e5);
  const u = new URL('https://open.neis.go.kr/hub/SchoolSchedule');
  Object.entries({ KEY: key, Type: 'json', pIndex: '1', pSize: '200', ATPT_OFCDC_SC_CODE: REGION.neis, SD_SCHUL_CODE: sch.neis, AA_FROM_YMD: ymd(from), AA_TO_YMD: ymd(to) })
    .forEach(([k, v]) => u.searchParams.set(k, v));
  const d = await getJson(fetchFn, u);
  if (d.RESULT && d.RESULT.CODE === 'INFO-200') return []; // 해당 기간 일정 없음
  const rows = d.SchoolSchedule?.[1]?.row;
  if (!rows) throw new Error('NEIS ' + (d.RESULT?.CODE || 'no data'));
  const yn = ['ONE', 'TW', 'THREE', 'FR', 'FIV', 'SIX'];
  return rows
    .filter(r => r.EVENT_NM && r.SBTR_DD_SC_NM !== '토요휴업일')
    .map(r => ({
      date: `${r.AA_YMD.slice(0, 4)}-${r.AA_YMD.slice(4, 6)}-${r.AA_YMD.slice(6, 8)}`,
      event: r.EVENT_NM.trim(),
      exam: EXAM.test(r.EVENT_NM),
      off: r.SBTR_DD_SC_NM === '휴업일' || r.SBTR_DD_SC_NM === '공휴일',
      grades: yn.map((p, i) => (r[p + '_GRADE_EVENT_YN'] === 'Y' ? i + 1 : 0)).filter(Boolean),
    }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

async function info(fetchFn, key, sch, year) {
  for (const y of [year, year - 1]) {
    const u = new URL('https://www.schoolinfo.go.kr/openApi.do');
    Object.entries({ apiKey: key, apiType: '09', sidoCode: REGION.sido, sggCode: REGION.sgg, schulKndCode: sch.kind, pbanYr: String(y) })
      .forEach(([k, v]) => u.searchParams.set(k, v));
    const d = await getJson(fetchFn, u);
    if (d.resultCode !== 'success') throw new Error('학교알리미 ' + (d.resultCode || 'error'));
    const r = (d.list || []).find(x => x.SCHUL_NM === sch.full);
    if (!r) continue;
    // 초등 1~6학년 = COL_?1~6, 중등 1~3학년 = COL_?9~11
    const cols = sch.kind === '02' ? [1, 2, 3, 4, 5, 6] : [9, 10, 11];
    return {
      year: y,
      students: n(r.COL_S_SUM), classes: n(r.COL_C_SUM), perClass: n(r.COL_SUM), teachers: n(r.TEACH_CNT),
      byGrade: cols.map((c, i) => ({ grade: i + 1, classes: n(r['COL_C' + c]), students: n(r['COL_S' + c]) })),
    };
  }
  return null;
}

export async function buildSchool(name, fromStr, fetchFn, env) {
  const sch = SCHOOLS[name];
  if (!sch) return { status: 404, body: { error: '연결된 학교가 아닙니다' } };
  const from = /^\d{4}-\d{2}-\d{2}$/.test(fromStr || '') ? new Date(fromStr + 'T00:00:00Z') : new Date();
  const [s, i] = await Promise.allSettled([
    env.NEIS_KEY ? schedule(fetchFn, env.NEIS_KEY, sch, from) : Promise.reject(new Error('NEIS 키 없음')),
    env.SCHOOLINFO_KEY ? info(fetchFn, env.SCHOOLINFO_KEY, sch, from.getUTCFullYear()) : Promise.reject(new Error('학교알리미 키 없음')),
  ]);
  // 오류 문구는 짧은 이유만 (주소·키 노출 금지)
  const why = r => String(r.reason?.message || 'error').replace(/https?:\S+/g, '').slice(0, 60);
  return {
    status: 200,
    body: {
      name, full: sch.full,
      schedule: s.status === 'fulfilled' ? s.value : null,
      info: i.status === 'fulfilled' ? i.value : null,
      errors: { schedule: s.status === 'rejected' ? why(s) : null, info: i.status === 'rejected' ? why(i) : null },
    },
  };
}

export default async function handler(req, res) {
  const q = req.query || {};
  const { status, body } = await buildSchool(String(q.s || ''), String(q.from || ''), fetch, process.env);
  res.setHeader('Cache-Control', status === 200 && !body.errors.schedule && !body.errors.info
    ? 's-maxage=21600, stale-while-revalidate=86400' : 'no-store');
  res.status(status).json(body);
}

