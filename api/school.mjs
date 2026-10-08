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
const EXAM = /고사|시험|수행평가|학력평가/;

const ymd = d => d.toISOString().slice(0, 10).replace(/-/g, '');
const n = v => (v == null || v === '' ? null : Number(v));

async function getJson(fetchFn, url) {
  const r = await fetchFn(url, { headers: { 'User-Agent': 'academy-records' } });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  try { return await r.json(); } catch { throw new Error('응답 형식 오류'); } // 원문 일부가 오류 문구로 새지 않게
}
// 한국 날짜(서버 기준). 화면이 보낸 날짜는 쓰지 않는다 — 캐시 우회·호출 낭비 방지
export const kstToday = (now = Date.now()) => new Date(now + 9 * 36e5).toISOString().slice(0, 10);

async function schedule(fetchFn, key, sch, from) {
  const to = new Date(from.getTime() + DAYS * 864e5);
  const u = new URL('https://open.neis.go.kr/hub/SchoolSchedule');
  Object.entries({ KEY: key, Type: 'json', pIndex: '1', pSize: '1000', ATPT_OFCDC_SC_CODE: REGION.neis, SD_SCHUL_CODE: sch.neis, AA_FROM_YMD: ymd(from), AA_TO_YMD: ymd(to) })
    .forEach(([k, v]) => u.searchParams.set(k, v));
  const d = await getJson(fetchFn, u);
  if (d.RESULT && d.RESULT.CODE === 'INFO-200') return []; // 해당 기간 일정 없음
  const rows = d.SchoolSchedule?.[1]?.row;
  if (!rows) throw new Error('NEIS ' + (d.RESULT?.CODE || 'no data'));
  const yn = ['ONE', 'TW', 'THREE', 'FR', 'FIV', 'SIX'];
  return rows
    .filter(r => r.EVENT_NM && /^\d{8}$/.test(r.AA_YMD) && r.EVENT_NM.trim() !== '토요휴업일')
    .map(r => ({
      date: `${r.AA_YMD.slice(0, 4)}-${r.AA_YMD.slice(4, 6)}-${r.AA_YMD.slice(6, 8)}`,
      event: r.EVENT_NM.trim(),
      exam: EXAM.test(r.EVENT_NM) && !/수능|수학능력/.test(r.EVENT_NM), // 수능일은 초·중학교엔 휴업일
      off: r.SBTR_DD_SC_NM === '휴업일' || r.SBTR_DD_SC_NM === '공휴일',
      // 이름에 "2학년"처럼 학년이 있으면 그 학년만 (NEIS 학년 표시가 전 학년 Y로 오는 경우가 있음)
      grades: (r.EVENT_NM.match(/[1-6](?=학년)/g) || []).map(Number).length
        ? [...new Set(r.EVENT_NM.match(/[1-6](?=학년)/g).map(Number))]
        : yn.map((p, i) => (r[p + '_GRADE_EVENT_YN'] === 'Y' ? i + 1 : 0)).filter(Boolean),
    }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

async function info(fetchFn, key, sch, year) {
  for (const y of [year, year - 1]) {
    const last = y === year - 1;
    const u = new URL('https://www.schoolinfo.go.kr/openApi.do');
    Object.entries({ apiKey: key, apiType: '09', sidoCode: REGION.sido, sggCode: REGION.sgg, schulKndCode: sch.kind, pbanYr: String(y) })
      .forEach(([k, v]) => u.searchParams.set(k, v));
    const d = await getJson(fetchFn, u);
    if (d.resultCode !== 'success') { if (last) throw new Error('학교알리미: ' + String(d.resultMsg || d.resultCode || 'error').replace(/[0-9a-fA-F]{16,}/g, '').slice(0, 40)); continue; } // 이유 문구만(키처럼 보이는 값 제거) // 올해 공시 전이면 작년으로
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

export async function buildSchool(name, today, fetchFn, env) {
  const sch = SCHOOLS[name];
  if (!sch) return { status: 404, body: { error: '연결된 학교가 아닙니다' } };
  const from = new Date(today + 'T00:00:00Z');
  const [s, i] = await Promise.allSettled([
    env.NEIS_KEY ? schedule(fetchFn, env.NEIS_KEY, sch, from) : Promise.reject(new Error('NEIS 키 없음')),
    env.SCHOOLINFO_KEY ? info(fetchFn, env.SCHOOLINFO_KEY, sch, from.getUTCFullYear()) : Promise.reject(new Error('학교알리미 키 없음')),
  ]);
  // 오류 문구는 짧은 이유만 (주소·키 노출 금지)
  const why = r => String(r.reason?.message || 'error').replace(/https?:\S+/g, '').slice(0, 60);
  return {
    status: 200,
    body: {
      name, full: sch.full, today,
      schedule: s.status === 'fulfilled' ? s.value : null,
      info: i.status === 'fulfilled' ? i.value : null,
      errors: { schedule: s.status === 'rejected' ? why(s) : null, info: i.status === 'rejected' ? why(i) : null },
    },
  };
}

export default async function handler(req, res) {
  const q = req.query || {};
  // s 말고 다른 값이 붙으면 거절 (아무 값이나 붙여 캐시를 우회하는 호출 방지)
  if (Object.keys(q).some(k => k !== 's')) { res.setHeader('Cache-Control', 'no-store'); return res.status(400).json({ error: '잘못된 요청' }); }
  const { status, body } = await buildSchool(String(q.s || ''), kstToday(), fetch, process.env);
  res.setHeader('Cache-Control', status === 200 && !body.errors.schedule && !body.errors.info
    ? 's-maxage=21600, stale-while-revalidate=86400' : 'no-store');
  res.status(status).json(body);
}

