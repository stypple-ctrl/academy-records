// api/school.mjs 점검 (가짜 응답으로, 네트워크·키 없이). 실행: node tests/api-school.test.mjs
import handler, { buildSchool, kstToday } from '../api/school.mjs';

const KEY = { NEIS_KEY: 'neis-secret-123', SCHOOLINFO_KEY: 'info-secret-456' };
const neisRows = [
  { AA_YMD: '20261015', EVENT_NM: '2학기 1회고사', SBTR_DD_SC_NM: '해당없음', ONE_GRADE_EVENT_YN: 'Y', TW_GRADE_EVENT_YN: 'Y', THREE_GRADE_EVENT_YN: 'Y' },
  { AA_YMD: '20261003', EVENT_NM: '개천절', SBTR_DD_SC_NM: '공휴일', ONE_GRADE_EVENT_YN: 'Y' },
  { AA_YMD: '20261010', EVENT_NM: '토요휴업일', SBTR_DD_SC_NM: '휴업일' },
  { AA_YMD: '20261020', EVENT_NM: '교원능력개발평가', SBTR_DD_SC_NM: '해당없음' },
  { AA_YMD: '2026-bad', EVENT_NM: '<img>', SBTR_DD_SC_NM: '해당없음' },
];
const infoList = [{ SCHUL_NM: '단원중학교', COL_S_SUM: '612', COL_C_SUM: '24', COL_SUM: '25.5', TEACH_CNT: '45', COL_C9: '8', COL_S9: '205', COL_C10: '8', COL_S10: '201', COL_C11: '8', COL_S11: '206' }];
const seen = [];
const fake = async url => {
  seen.push(String(url));
  const h = new URL(url).host;
  const body = h.includes('neis') ? { SchoolSchedule: [{ head: [] }, { row: neisRows }] } : { resultCode: 'success', list: infoList };
  return { ok: true, json: async () => body };
};

const fail = [];
const t = (name, ok) => { if (!ok) fail.push(name); };

const a = await buildSchool('단원중', '2026-10-01', fake, KEY);
t('정상 200', a.status === 200);
t('일정 날짜순·토요휴업일·잘못된 날짜 제외', a.body.schedule.map(e => e.date).join() === '2026-10-03,2026-10-15,2026-10-20');
t('평가라는 말만으로 시험 아님', a.body.schedule[2].exam === false);
t('시험 표시', a.body.schedule.find(e => e.event.includes('고사')).exam === true && a.body.schedule[0].exam === false);
t('학년 표시', a.body.schedule[1].grades.join() === '1,2,3');
t('학생·학급 수', a.body.info.students === 612 && a.body.info.classes === 24 && a.body.info.byGrade[0].students === 205);
t('지역·학교 코드로 조회', seen.some(u => u.includes('SD_SCHUL_CODE=7611120') && u.includes('ATPT_OFCDC_SC_CODE=J10')) && seen.some(u => u.includes('apiType=09') && u.includes('sggCode=41273')));
t('응답에 키 없음', !JSON.stringify(a.body).includes('secret'));

const b = await buildSchool('어디중', '', fake, KEY);
t('목록 밖 학교 거절', b.status === 404 && seen.length === 2);

const c = await buildSchool('고잔초', '2026-10-01', fake, {});
t('키 없으면 이유만', c.status === 200 && c.body.schedule === null && c.body.errors.schedule.includes('키 없음'));

const boom = async url => { throw new Error('connect fail ' + url); };
const d = await buildSchool('와동중', '2026-10-01', boom, KEY);
t('오류에 주소·키 노출 없음', !JSON.stringify(d.body).includes('secret') && !JSON.stringify(d.body).includes('http'));

t('한국 날짜', kstToday(Date.UTC(2026, 9, 8, 16)) === '2026-10-09');
const res = () => { const o = { h: {}, setHeader(k, v) { o.h[k] = v }, status(c) { o.c = c; return o }, json(b) { o.b = b; return o } }; return o; };
const r1 = res(); await handler({ query: { s: '단원중', z: '1' } }, r1);
t('다른 값이 붙으면 거절', r1.c === 400 && r1.h['Cache-Control'] === 'no-store');
// 학교알리미: 올해 실패하면 작년으로
let calls = 0;
const lastYear = async url => { const u = new URL(url); if (u.host.includes('neis')) return { ok: true, json: async () => ({ RESULT: { CODE: 'INFO-200' } }) };
  calls++; return { ok: true, json: async () => (u.searchParams.get('pbanYr') === '2026' ? { resultCode: 'fail' } : { resultCode: 'success', list: infoList }) }; };
const e = await buildSchool('단원중', '2026-03-02', lastYear, KEY);
t('올해 공시 전이면 작년 값', e.body.info?.year === 2025 && calls === 2 && e.body.schedule.length === 0);
const html = async () => ({ ok: true, json: async () => { throw new SyntaxError('Unexpected token < in <html>secret-page') } });
const f = await buildSchool('단원중', '2026-10-01', html, KEY);
t('형식 오류는 고정 문구', f.body.errors.schedule === '응답 형식 오류' && !JSON.stringify(f.body).includes('secret'));

console.log(fail.length ? 'API TEST FAIL ' + fail.join(' | ') : 'API TEST PASS 16');
process.exit(fail.length ? 1 : 0);
