# 학원 기록관리 데모 · 피드백 반영 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 체험용 데모(`index.html`)에서 찾은 문제를 "안전한 것 → 위험한 것" 순서로 5단계에 걸쳐 고친다.

**Architecture:** 단일 파일 `index.html`(인라인 CSS + vanilla JS, 메모리 데이터) 구조를 유지한다. 각 작업은 파일 끝에 있는 `selfTest()`에 검사를 추가하고, `index.html#test`로 열어 콘솔의 `SELFTEST PASS` 로 확인한다. 단계마다 git 커밋으로 되돌릴 지점을 남긴다.

**Tech Stack:** HTML/CSS/vanilla JS (빌드·의존성 없음), Pretendard CDN 폰트, 검증은 Claude 브라우저 패널.

**Spec:** 원본 PRD(대화에 붙여넣은 「학원 통합 기록관리 시스템 PRD」, 2026-10-01) + 이 대화의 피드백 3건(역할별 아쉬움, 실사용 불편 예측, 6관점 진단)과 분류표.

## Global Constraints

- 파일은 `index.html` 하나. 새 파일은 이 계획서와 `.gitignore`뿐. 라이브러리 추가 금지.
- 데모 기준일 `TODAY='2026-10-01'` 고정, 데이터는 메모리(`DB`)에만 있음. DB 연결·로그인·RLS는 범위 밖.
- 화면 문구는 한국어. 학부모에게 보이는 글에는 `NEG_WORDS`(Task 3) 단어가 나오면 안 됨.
- 디자인 토큰(`--acc`, `--raise`, `.seg`, `.chip`, `.bd`)을 재사용. 새 색 추가 금지(예외: 기존 `--blue`).
- PRD 수치 그대로: 단어 30문항·24개 통과, 하락 경고 20%, 공백 14일, 위험 미완 3회·하락 15%·악화 2건·공백 21일, 오늘 챙길 학생 최대 5명.
- 기존 함수 이름(`careItems`, `riskOf`, `bundle`, `aiDraft`, `saveEntry`, `saveRem`, `rs`, `openCare`)은 유지하고 내부만 바꾼다.

## 범위 밖 (이번 계획에서 하지 않음)

- **결정 대기:** 학부모 연락 수단·발송 흐름, 리포트 승인→발송 주체, 원어민 숙제 입력 위치(에세이 마감 규칙), 반 이동·학기 전환. 원장 결정 후 별도 계획.
- **DB 단계:** 로그인, RLS, 수정 이력 영구 저장, 저장 실패 재시도, 계정 비활성화 실제 차단, 백업, 입력 시간 측정.
- **보류:** 원어민 화면 영어 지원(원어민 인원 미정).

## Review Focus

1. **새로고침하면 입력이 다 사라짐** → 데이터가 바뀐 뒤 새로고침·닫기 시 브라우저 경고. (Task 1, `beforeunload`)
2. **원장이 기준값을 바꾼 직후** → 모든 화면의 통과/미달·경고가 같은 기준을 따라야 함. (Task 6 테스트)
3. **동명이인** → 조교 카드·제안 목록·결과표에서 서로 다른 표시. (Task 2 테스트)
4. **담임이 아직 확정 안 했는데 학생이 강당에 옴** → 조교 화면에 "담임 확정 대기" 학생이 보여야 함. (Task 10 테스트)
5. **점수 칸에 -3, 31, 25.5, 빈칸 입력** → 0~30 정수로 보정, 결석자는 빈칸 허용. (Task 1 테스트)

---

## 1단계 · 빠른 성과 (위험 낮음)

### Task 0: 저장 지점과 자동 점검 틀

**Files:**
- Modify: `index.html` (스크립트 맨 끝, `DB=buildData();render();` 줄)
- Create: `.gitignore` (내용: `.DS_Store`)

**Interfaces:**
- Produces: `selfTest(): {pass:number, fail:string[]}` — 내부에서 `T(name:string, fn:()=>boolean)`로 검사를 등록. 실행 전 `DB, ME, dismissed, RS, DRAFT, window.confirm`을 저장하고 `DB=buildData()`로 새 데이터에서 돌린 뒤 끝나면 원래대로 복구.
- Produces: 부팅 시 `location.hash=='#test'`면 `selfTest()` 실행 후 `console.log('SELFTEST PASS '+pass)` 또는 `console.log('SELFTEST FAIL '+fail.join(' | '))`.

- [ ] **Step 1: git 저장소 만들기**

Run: `cd /Users/andy/Manager01 && git init && git add index.html docs .gitignore && git commit -m "chore: 데모 첫 버전 저장"`
Expected: `1 file changed` 이상, 커밋 생성

- [ ] **Step 2: `selfTest()`와 첫 검사 추가**

```js
T('데이터 생성', ()=>DB.students.length==96 && DB.classes.length==20);
```

- [ ] **Step 3: 확인**

Run: 브라우저 패널에서 `file:///Users/andy/Manager01/index.html#test` 열고 콘솔 확인
Expected: `SELFTEST PASS 1`

- [ ] **Step 4: Commit** — `git commit -am "test: selfTest 점검 틀 추가"`

### Task 1: 입력 실수 방지 (조교·교사)

**Files:** Modify `index.html` — `rs`, `r0`, `rm`, `closeModal`, `cycHw`, `confirmSug`, `resetDemo`, `setScore`

**Interfaces:**
- Produces: `modalDirty(): boolean` — `M.kind=='care'`이고 `area|type|finding|action` 중 하나라도 있으면 true.
- Produces: `clampScore(v:string): number|''` — 빈칸은 `''`, 그 외 `Math.round` 후 0~30으로 자름. `setScore`가 사용.
- Produces: 전역 `let DIRTY=false` — DB를 바꾸는 저장 함수(`saveCare, saveResult, saveTicket, saveEntry, saveRem, confirmSug, saveShow`)가 true로 설정. `window.onbeforeunload`는 `DIRTY`일 때만 경고.

- [ ] **Step 1: 실패하는 검사 작성**

```js
T('버튼 두 번 눌러도 선택 유지', ()=>{RS.S1={};rs('S1','att','normal');rs('S1','att','normal');return RS.S1.att=='normal'});
T('숙제 버튼 4번 누르면 빈칸 복귀', ()=>{DRAFT.x={S1:{hw:{reading:''}}};for(let i=0;i<4;i++)cycHw('x','S1','reading');return DRAFT.x.S1.hw.reading==''});
T('작성 중 케어 창 감지', ()=>{M={kind:'care',area:'word',type:null,finding:'',action:null};return modalDirty()});
T('모두 보류는 확인 거절 시 유지', ()=>{window.confirm=()=>false;DB.suggestions.push({id:'SGt',cls:'C11',sid:'S1',status:'pending'});confirmSug('C11',false);return DB.suggestions.find(s=>s.id=='SGt').status=='pending'});
T('점수 보정', ()=>clampScore('-3')===0&&clampScore('31')===30&&clampScore('25.5')===26&&clampScore('')==='');
```

- [ ] **Step 2: 확인 → FAIL** (`#test`, 콘솔에 `SELFTEST FAIL` 과 위 이름들)

- [ ] **Step 3: 구현**
  - `rs`: `r0` 토글 제거, 항상 값 설정. `r0` 삭제.
  - `cycHw`: 순서 `['','O','△','X']` 순환.
  - `rm()`의 배경 클릭: `modalDirty()`면 `confirm('작성 중인 내용이 사라집니다. 닫을까요?')` 후 닫기.
  - `confirmSug(cid,false)`와 `resetDemo()`: 시작에 `confirm()`, 거절이면 아무것도 안 함. 문구: `'제안 N건을 모두 보류할까요? 되돌릴 수 없습니다.'`, `'입력한 내용이 모두 지워집니다. 초기화할까요?'`

- [ ] **Step 4: 확인 → PASS** (`SELFTEST PASS 6`)
- [ ] **Step 5: Commit** — `git commit -am "fix: 입력 실수 방지 (재탭 해제, 창 닫힘, 보류·초기화 확인)"`

### Task 2: 이름 표시와 작은 권한 정리

**Files:** Modify `index.html` — `remCard`, `entryPage`, `homePage`(제안 목록·티켓 버튼), `timelinePage`, `openConsult`, `adminPage`

**Interfaces:**
- Produces: `stLabel(st): string` → `"윤채원 · 초5 B반"` (반 이름 마지막 글자 + "반"). 조교 카드·입력표·제안 목록·나머지 결과표에 사용.
- Produces: `phoneOf(st): string` — 원장 또는 그 학생의 담임이면 전체 번호, 아니면 `010-****-1234`.
- Produces: `consultText(sid): string` — 상담 요약을 줄글로. 모달에 "복사" 버튼 → `navigator.clipboard.writeText(consultText(sid))` 후 토스트 `'복사됨'`.
- Produces: `SETTING_RANGE = {pass:[10,30],dropPct:[5,50],gapDays:[3,60],fastPass:[1,10],maxCare:[3,10],incompleteRisk:[1,10],riskDropPct:[5,50],worseRisk:[1,10],riskGapDays:[7,90]}`, `setSetting(k:string, v:string): boolean` — 정수가 아니거나 범위 밖이면 토스트 `'{min}~{max} 사이 숫자만 가능합니다'` + false, 입력칸은 원래 값으로 되돌림.
- 원장도 반 학생 표에 "티켓" 버튼 표시 (`openTicket` 허용, 케어 버튼은 계속 숨김).

- [ ] **Step 1: 실패하는 검사**

```js
T('동명이인 구분', ()=>{const g={};DB.students.forEach(s=>(g[s.name]=g[s.name]||[]).push(stLabel(s)));return Object.values(g).every(a=>new Set(a).size==a.length)});
T('연락처 권한', ()=>{const s=ST('S1');ME=US('D1');const a=phoneOf(s);ME=US('T2');const b=phoneOf(s);return !a.includes('*')&&b.includes('*')});
T('기준값 범위', ()=>!setSetting('pass','0')&&DB.settings.pass==24&&setSetting('pass','26')&&DB.settings.pass==26);
T('원장 티켓 버튼', ()=>{ME=US('D1');HOMECLS='C11';return homePage().includes('openTicket(')});
T('상담 요약 텍스트', ()=>consultText('S1').includes(ST('S1').name));
```

- [ ] **Step 2: FAIL 확인** → **Step 3: 구현** → **Step 4: PASS 확인**
- [ ] **Step 5: Commit** — `git commit -am "feat: 동명이인 표시, 연락처 권한, 기준값 범위, 상담 요약 복사"`

### Task 3: 리포트에서 부정 원본 문장 제거 (S1)

**Files:** Modify `index.html` — `aiDraft`, 리포트 후보 기본 선택

**Interfaces:**
- Produces: `NEG_WORDS = ['엎드려','잡담','산만','악화','미제출','미완','장난','부족','하락']`
- Produces: `parentPhrase(r): string` — 원본 `finding`을 쓰지 않고 영역·조치로만 문장 생성: `"{AREAS[area]}에서 더 다져야 할 부분을 발견해 {ACTIONS[action]}로 함께 보완했고, 이후 좋아진 모습을 확인했습니다."` 유형이 `positive`면 `"{AREAS[area]}에서 스스로 좋은 변화를 보여 칭찬해 주었습니다."`
- `aiDraft(b)`는 `result=='improved'` 또는 `type=='positive'`인 기록만, `parentPhrase`로만 사용. 점수가 내려간 달은 "조금 낮아져" 대신 `"복습 루틴을 함께 다시 잡고 있습니다"`만 쓴다.
- Consumed by: Task 5 학부모 화면.

- [ ] **Step 1: 실패하는 검사**

```js
T('초안에 부정어 없음', ()=>DB.students.every(s=>{const d=aiDraft(bundle(s.id,'2026-09'));return !NEG_WORDS.some(w=>d.includes(w))}));
T('초안에 원본 문장 없음', ()=>{const r=DB.care.find(x=>x.type=='behavior'&&x.result=='improved');return !r||!aiDraft(bundle(r.sid,r.created.slice(0,7))).includes(r.finding)});
```

- [ ] **Step 2~4:** FAIL → `parentPhrase` 구현 후 `aiDraft` 교체 → PASS
- [ ] **Step 5: Commit** — `git commit -am "fix: 리포트 초안에서 부정 원본 문장 제거"`

### Task 4: 틈새 정리 (대시보드·리포트 숫자)

**Files:** Modify `index.html` — `dashboard`, `reportPage`, `homePage`, `entryPage`

**Interfaces:**
- 요약 카드 "이번 주 케어 기록" → "기간 내 케어 기록", 필터 기간(`start`) 사용.
- 위험 학생: 12명 이후 `"더보기 (N명)"` 버튼, 전역 `RISKALL` 토글.
- 기록 캘린더: 전역 `CALM`(기본 `TODAY.slice(0,7)`) + 이전/다음 달 버튼.
- Produces: `reportMonths(): string[]` — 점수가 있는 달 + 이번 달(오름차순). 리포트 월 선택에 사용.
- "교사별 케어 기록" 막대 → "교사별 결과 입력률"(확인일 지난 기록 중 결과 입력 비율, %).
- 리포트 "전월 대비" 막대 → 전월·이번 달 단어 평균 두 개만. 통과 수·시험 수는 숫자 문장으로.
- "확인함"으로 숨긴 항목이 있으면 `"숨긴 항목 N개 다시 보기"` 버튼 (해당 반 키만 `dismissed`에서 삭제).
- 반 칩: 오늘 수업 반을 앞으로, 시작 시간순.

- [ ] **Step 1: 실패하는 검사**

```js
T('기간 필터가 케어 카드에 반영', ()=>{FILT.period='30';ME=US('D1');const h=dashboard();FILT.period='14';return h.includes('기간 내 케어 기록')});
T('리포트 월에 10월 포함', ()=>reportMonths().includes('2026-10')&&reportMonths().includes('2026-08'));
```

- [ ] **Step 2~4:** FAIL → 구현 → PASS. 브라우저로 대시보드·리포트를 열어 그래프가 깨지지 않는지 눈으로 확인.
- [ ] **Step 5: Commit** — `git commit -am "fix: 대시보드 기간 필터·캘린더·리포트 그래프 정리"`

**1단계 끝 → 원장님 체험 확인 후 2단계.**

---

## 2단계 · 학부모 리포트 (새 화면, 위험 낮음)

### Task 5: 학부모용 월간 리포트 미리보기

**Files:** Modify `index.html` — 새 함수 `parentView`, `PAGES.parent`, `TITLE.parent`, 리포트 화면 버튼, `@media print` CSS

**Interfaces:**
- Consumes: `bundle(sid,month)`, `parentPhrase(r)`, `NEG_WORDS`, `DB.comments[sid|month]`
- Produces: `parentView(sid:string, month:string): string` — 폭 420px 모바일 카드 1장. 구성(위→아래):
  1. 학원명·학생 이름·"{M}월 성장 리포트"
  2. 담임 코멘트(`comment.draft`). 승인 전이면 상단에 `"미리보기 · 담임 승인 전"` 띠
  3. 단어 평균 꺾은선(최근 3개월 월평균) + "지난달보다 +N점" 한 줄
  4. "이번 달 이렇게 챙겼어요" — 담임이 고른(`picked`) 기록을 `parentPhrase`로 발견→조치→결과 3칸 카드
  5. 숙제 제출률·"보충 학습" 횟수 원형 게이지 ("나머지"라는 말 대신 "보충 학습")
  6. 대표작 전월·이번 달 나란히 (링크 있으면 "보기" 버튼)
- 리포트 화면에 `"학부모 화면 미리보기"` 버튼 → `nav('parent',{sid,month})`. 미리보기 화면에 `"인쇄 / PDF 저장"`(`window.print()`)과 `"리포트로 돌아가기"` 버튼.
- 권한: 원장·담임만.

- [ ] **Step 1: 실패하는 검사**

```js
T('학부모 화면 부정어 없음', ()=>DB.students.slice(0,30).every(s=>{const h=parentView(s.id,'2026-09').replace(/<[^>]+>/g,'');return !NEG_WORDS.some(w=>h.includes(w))}));
T('승인 전 표시', ()=>{delete DB.comments['S1|2026-09'];return parentView('S1','2026-09').includes('담임 승인 전')});
T('나머지 용어 숨김', ()=>!parentView('S1','2026-09').includes('나머지'));
```

- [ ] **Step 2~4:** FAIL → 구현 → PASS. 브라우저에서 `mobile` 크기로 열어 스크린샷 확인.
- [ ] **Step 5: Commit** — `git commit -am "feat: 학부모용 월간 리포트 미리보기"`

---

## 3단계 · 데이터 일관성 (위험 중간)

### Task 6: 판단 규칙 하나로 + 조교 오늘 수업 제한

**Files:** Modify `index.html` — `careItems`, `riskOf`, `timelinePage`, `dashboard`, `bundle`, `openConsult`, `studentsPage`, `entryPage`

**Interfaces:**
- Produces: `isPass(score:number): boolean` = `score >= DB.settings.pass`. 저장된 `.passed`는 읽지 않는다(모든 읽기 자리를 교체).
- Produces: `wordDrop(sid): {last:number, avg:number, pct:number}|null` — 최근 3회 평균 대비 `dropPct` 이상 하락이면 값. `careItems`의 'drop'이 이걸 사용.
- Produces: `signalsOf(st): {label:string, color:'r'|'a'|'n', level:'risk'|'watch'}[]` — `risk`: 기존 5-4 네 가지. `watch`: `wordDrop`, 통과 미달 2회 연속.
- `riskOf(st)` = `signalsOf(st).filter(x=>x.level=='risk')` (대시보드 위험 목록 인원 변화 없음). 타임라인·학생 목록은 `signalsOf` 전부를 보여주고, `watch`는 `"주의"` 배지.
- Produces: `entryClasses(): Class[]` — 조교는 `TODAY`에 수업이 있는 담임반만, 교사는 자기 반, 원장은 전체. 조교가 오늘 수업 없는 반에 들어오면 표 대신 `"오늘 수업이 없는 반입니다"`.

- [ ] **Step 1: 실패하는 검사**

```js
T('급락 학생은 원장 화면에도 주의', ()=>{const s=DB.students.find(x=>x.pattern=='drop');return signalsOf(s).some(x=>x.level=='watch')&&careItems(s.cls).some(i=>i.st.id==s.id)});
T('기준 변경 즉시 반영', ()=>{DB.settings.pass=26;const sc=scoresOf('S1').find(x=>x.score==25);ME=US('D1');const ok=!sc||!isPass(sc.score);DB.settings.pass=24;return ok});
T('조교는 오늘 수업 반만', ()=>{ME=US('A1');return entryClasses().every(c=>isClassDay(c,TODAY))});
T('조교 지난 점수 못 봄', ()=>{ME=US('A1');ENT.cls='C11';return !entryPage().includes('class="scin"')});
```

- [ ] **Step 2~4:** FAIL → 구현 → PASS. 대시보드·타임라인·입력 화면을 원장/교사/조교로 각각 열어 오류 없는지 확인.
- [ ] **Step 5: Commit** — `git commit -am "fix: 통과·위험 판단 규칙 통일, 조교 입력은 오늘 수업만"`

**3단계 끝 → 체험 확인.**

---

## 4단계 · 나머지 티켓 묶음 (위험 높음 — 세 작업 모두 같은 데이터를 건드림, 순서 고정)

### Task 7: 과제별 결과 입력 + 오늘 결과 되돌리기

**Files:** Modify `index.html` — `remCard`, `saveRem`, `remedialPage`, 새 `undoRem`

**Interfaces:**
- `RS[sid]` 구조 변경: `{in, c20, c40, pass, att, extra, extraDone, memo, outs:{[ticketId]:'done'|'partial'|'incomplete'}}`. 카드의 과제 줄마다 완료/부분/미완 버튼, 위에 `"모두 완료"` 버튼.
- `saveRem(sid)`: 모든 과제에 결과가 있어야 저장. 티켓마다 자기 결과로 로그 1개, `done`이 아닌 티켓만 이월.
- Produces: `undoRem(sid): void` — 오늘(`TODAY`) 이 학생 로그 삭제, 해당 티켓 `status='open'`, 그 티켓에서 오늘 만들어진 이월 티켓(`from==id && avail==addDays(TODAY,1)`) 삭제. "오늘 처리 결과" 표에 학생별 `"되돌리기"` 버튼(조교만).

- [ ] **Step 1: 실패하는 검사**

```js
T('과제별 결과·부분 이월', ()=>{const sid='S1';DB.tickets.push({id:'Ta',sid,task:'단어',status:'open',avail:TODAY,from:null},{id:'Tb',sid,task:'듣기',status:'open',avail:TODAY,from:null});
  const before=termInc(sid);ME=US('A1');RS[sid]={in:'17:00',c20:1,c40:2,pass:'60',att:'normal',outs:{Ta:'done',Tb:'incomplete'}};saveRem(sid);
  return DB.tickets.filter(t=>t.from=='Tb').length==1&&!DB.tickets.some(t=>t.from=='Ta')&&termInc(sid)==before+1});
T('오늘 결과 되돌리기', ()=>{undoRem('S1');return DB.tickets.find(t=>t.id=='Tb').status=='open'&&!DB.tickets.some(t=>t.from=='Tb')&&!DB.logs.some(l=>l.sid=='S1'&&l.date==TODAY)});
```

- [ ] **Step 2~4:** FAIL → 구현 → PASS
- [ ] **Step 5: Commit** — `git commit -am "feat: 나머지 과제별 결과 입력, 오늘 결과 되돌리기"`

### Task 8: 점수 정정 시 티켓 정리 + 티켓 취소

**Files:** Modify `index.html` — `saveEntry`, `homePage`, `remCard`(읽기 전용 모드), 새 `cancelTicket`

**Interfaces:**
- Consumes: `isPass` (Task 6)
- 티켓에 상태 `'canceled'` 추가. `remedialPage`·대시보드는 `open`만 대기로 센다(기존 그대로 동작).
- `saveEntry`: 저장 후 각 학생에 대해 — 새 점수가 통과면 이 수업(`src==sess.date`)에서 나온 로그 없는 `"단어 재시험"` 티켓을 `canceled`, 여전히 미달이면 과제명 점수를 새 값으로 갱신. 숙제가 X가 아니게 바뀐 항목도 같은 방식으로 취소. 해당 학생의 확정 대기 제안 중 더 이상 맞지 않는 것은 `dismissed`.
- Produces: `cancelTicket(id:string): boolean` — 로그가 있으면 토스트 `'이미 처리된 과제는 취소할 수 없습니다'` + false. 교사(자기 학생)·원장만. 교사 홈 "오늘 나머지" 대기 목록과 나머지 현황 카드에 `"취소"` 버튼.

- [ ] **Step 1: 실패하는 검사**

```js
T('점수 정정 시 재시험 티켓 취소', ()=>{ME=US('A1');const ss=DB.sessions.find(s=>s.pending);const sid=studentsOf(ss.cls)[0].id;ENT.cls=ss.cls;entryPage();
  Object.values(DRAFT[ss.id]).forEach(d=>{d.score=25;Object.keys(d.hw).forEach(k=>d.hw[k]='O')});DRAFT[ss.id][sid].score=20;saveEntry(ss.id);
  ME=US(CL(ss.cls).teacher);confirmSug(ss.cls,true);ME=US('A1');entryPage();DRAFT[ss.id][sid].score=26;saveEntry(ss.id);
  return !DB.tickets.some(t=>t.sid==sid&&t.src==TODAY&&t.status=='open'&&t.task.startsWith('단어 재시험'))});
T('처리된 티켓은 취소 불가', ()=>{const t=DB.tickets.find(x=>DB.logs.some(l=>l.ticket==x.id));ME=US('D1');return cancelTicket(t.id)===false});
```

- [ ] **Step 2~4:** FAIL → 구현 → PASS
- [ ] **Step 5: Commit** — `git commit -am "fix: 점수 정정 시 티켓 정리, 티켓 취소"`

### Task 9: 케어 기록 수정·삭제

**Files:** Modify `index.html` — `openCare`, `saveCare`, `careFlow`/타임라인 카드, 새 `deleteCare`

**Interfaces:**
- `openCare(sid, pre, rid?)` — `rid`가 있으면 그 기록 값으로 채운 수정 모드. 작성자 본인만.
- 수정 시 `r.history=(r.history||[]).concat({at:TODAY, by:ME.id, before:{area,type,finding,action,follow,cand}})`. 타임라인 카드에 `"수정됨"` 배지.
- Produces: `deleteCare(rid): boolean` — 작성자 본인 + `created==TODAY`이고 결과가 없을 때만. 그 외 토스트 `'오늘 작성한 기록만 삭제할 수 있습니다'`.

- [ ] **Step 1: 실패하는 검사**

```js
T('케어 수정 이력', ()=>{ME=US('T1');const r=DB.care.find(x=>x.teacher=='T1');openCare(r.sid,{},r.id);M.finding='수정본';saveCare();return r.finding=='수정본'&&r.history.length==1});
T('지난 기록 삭제 불가', ()=>{const r=DB.care.find(x=>x.teacher=='T1'&&x.created<TODAY);return deleteCare(r.id)===false});
```

- [ ] **Step 2~4:** FAIL → 구현 → PASS
- [ ] **Step 5: Commit** — `git commit -am "feat: 케어 기록 수정(이력 보존)·당일 삭제"`

**4단계 끝 → 처음 체험 순서(조교 입력 → 담임 확정 → 조교 처리 → 원장 대시보드)를 처음부터 다시 돌려 전체 확인.**

---

## 5단계 · 화면 재구성 (위험 중간, 한 화면씩)

### Task 10: 조교 카드 간소화

**Files:** Modify `index.html` — `remCard`, `remedialPage`, `saveRem`, `buildData`(학생 셔틀 시간)

**Interfaces:**
- 학생에 `shuttle:string` 추가(`'17:50'|'18:10'|'18:30'|'도보'`, 시드 고정 생성). 카드 정렬: 셔틀 이른 순, 도보는 맨 뒤. 카드 머리에 `"셔틀 17:50 · 12분 남음"`.
- Produces: `elapsedMin(from:string, now:string): number` (HH:MM 두 개의 분 차이).
- 20분 줄은 경과 ≥20분이거나 값이 있을 때만, 40분 줄은 ≥40분일 때만 표시. 표시 중인데 비어 있으면 `"체크할 차례"` 빨간 배지. 저장 필수 규칙도 같은 기준(보이는 줄만 필수).
- 맨 위 `"대기 학생 모두 입장"` 버튼 → 입장 안 한 학생 전부 현재 시각으로.
- `remedialPage` 하단에 `"담임 확정 대기"` 목록(이름·과제, 읽기 전용).

- [ ] **Step 1: 실패하는 검사**

```js
T('경과 분', ()=>elapsedMin('17:05','17:31')==26);
T('일괄 입장', ()=>{ME=US('A1');remedialPage();bulkCheckIn();return Object.values(RS).every(r=>r.in)});
T('셔틀 순 정렬', ()=>{ME=US('A1');const h=remedialPage();const t=[...h.matchAll(/셔틀 (\d\d:\d\d)/g)].map(m=>m[1]);return t.every((x,i)=>!i||t[i-1]<=x)});
T('확정 대기 학생 보임', ()=>{DB.suggestions.push({id:'SGz',cls:'C11',sid:'S2',task:'듣기 숙제 완료',status:'pending'});ME=US('A1');return remedialPage().includes('담임 확정 대기')});
```

- Produces: `bulkCheckIn(): void`

- [ ] **Step 2~4:** FAIL → 구현 → PASS. 조교로 열어 카드 높이가 전보다 줄었는지 스크린샷 비교.
- [ ] **Step 5: Commit** — `git commit -am "feat: 조교 카드 간소화 (경과 시간, 셔틀, 일괄 입장)"`

### Task 11: 교사 홈 재구성

**Files:** Modify `index.html` — `homePage`, `careItems`(짧은 태그), 새 `quickResult`, 메모 기능

**Interfaces:**
- `careItems` 항목에 `tag:string`(20자 이내, 예 `"단어 17 ↓34%"`, `"독해 2회 미제출"`) 추가. 카드에는 `tag`, 전체 문장은 `title` 말풍선.
- "오늘 챙길 학생" 5칸은 순위 2~4만. 순위 1(결과 확인)은 위쪽 `"결과 입력 대기 N건"` 패널로 분리, 각 줄에 개선/유지/악화 버튼 → `quickResult(rid:string, res:'improved'|'same'|'worse'): void`.
- `DB.memos=[{id, teacher, sid|null, text, created}]`. 홈 맨 위 한 줄 입력 `"오늘 메모 (쉬는 시간용)"` + 학생 선택(선택). 목록 각 줄에 `"케어 기록으로 정리"` → `openCare(sid,{finding:text, memoId})`, 저장되면 메모 삭제.

- [ ] **Step 1: 실패하는 검사**

```js
T('짧은 태그', ()=>DB.classes.filter(c=>c.type=='homeroom').every(c=>careItems(c.id).every(i=>i.top.tag.length<=20)));
T('빠른 결과 입력', ()=>{const r=DB.care.find(x=>!x.result&&x.follow<=TODAY);quickResult(r.id,'improved');return r.result=='improved'});
T('메모→케어 정리', ()=>{ME=US('T1');DB.memos.push({id:'MM1',teacher:'T1',sid:'S1',text:'발음 흐림',created:TODAY});openCare('S1',{finding:'발음 흐림',memoId:'MM1'});Object.assign(M,{area:'speaking',type:'concept',action:'oneone'});saveCare();return !DB.memos.some(m=>m.id=='MM1')});
```

- [ ] **Step 2~4:** FAIL → 구현 → PASS. 교사로 열어 5명이 스크롤 없이 보이는지 확인(데스크톱 폭).
- [ ] **Step 5: Commit** — `git commit -am "feat: 교사 홈 재구성 (결과 입력 묶음, 짧은 사유, 오늘 메모)"`

### Task 12: 원장 대시보드 재구성

**Files:** Modify `index.html` — `dashboard`, `homePage`(담임 요청 띠), 새 `directorTodos`, 상세 목록 모달

**Interfaces:**
- Produces: `directorTodos(): {text:string, count:number, go:string}[]` — 순서: 위험 학생 미처리, 결과 미입력, 담임 확정 대기 제안, 진도 지연 반, 리포트 승인 대기. `count==0`은 제외. 대시보드 맨 위 `"이번 주 할 일"` 카드.
- 요약 카드 클릭 → 해당 목록 모달(`openDrill(kind:'remedial'|'care'|'pending'|'gap'|'delayed')`).
- `DB.riskStatus = {[sid]: {status:'new'|'asked'|'contacted'|'done', at:string}}`. 위험 목록 각 줄에 상태 버튼(`새로 · 담임 확인 요청 · 학부모 연락함 · 해결`). `asked`면 해당 담임 홈 맨 위에 `"원장님 확인 요청: {이름}"` 띠.

- [ ] **Step 1: 실패하는 검사**

```js
T('할 일 개수 일치', ()=>{ME=US('D1');const t=directorTodos().find(x=>x.go=='care');const n=DB.care.filter(r=>!r.result&&r.follow<=TODAY).length;return n?t.count==n:!t});
T('담임 확인 요청 전달', ()=>{const s=DB.students.find(x=>riskOf(x).length);DB.riskStatus[s.id]={status:'asked',at:TODAY};ME=US(s.homeroom);HOMECLS=s.cls;return homePage().includes('원장님 확인 요청')});
```

- [ ] **Step 2~4:** FAIL → 구현 → PASS
- [ ] **Step 5: Commit** — `git commit -am "feat: 원장 대시보드 할 일·상세 목록·위험 학생 처리 상태"`

**5단계 끝 → 전체 체험 순서 재확인, `#test` 전체 PASS 확인, 원장님 최종 체험.**
