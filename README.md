# PNU AFTER DARK

부산대학교 할로윈 학생회 이벤트 **기획 시안**. GitHub Pages 정적 페이지 + Supabase 이벤트 수집 및 운영자 전용 집계.

## 실행 및 배포

```sh
npm ci
npm start
npm run check
npm test
node tests/browser.mjs
```

로컬: http://127.0.0.1:4173 / 운영: https://ancoded1234.github.io/pnu-halloween/

`main`에 push하면 `.github/workflows/pages.yml`이 `public/`만 GitHub Pages에 배포합니다. GitHub Pages 설정의 Source는 GitHub Actions입니다. 공개 소스에 포함된 Supabase publishable key는 브라우저용 키입니다. service_role 키와 결제 비밀키는 절대로 여기에 넣지 않습니다.

## 수집 및 지표 정의

- 분석 동의 후에만 무작위 세션 ID와 행동 이벤트를 생성합니다. 이름·학번·전화번호·전체 URL·리퍼러는 수집하지 않습니다.
- 30분 동안 활동이 없는 세션은 새 세션으로 분리합니다. 브라우저 탭별로 세션을 구분하며, 여러 기기에서 같은 사람을 합치지 않습니다.
- 페이지 방문 → 티켓 확인 → 신청 시작 → 데모 신청 완료를 시간 순서로 집계합니다. 프로그램 확인은 별도 선택 행동으로 기록합니다.
- 단계 이탈률 = 1 − 다음 단계의 고유 세션 수 / 현재 단계의 고유 세션 수. 단계가 0건이면 비율은 `—`로 표시합니다.
- 버튼별 전체 클릭 수와 고유 클릭 세션 수를 구분합니다.
- 실제 구매 전환율 = 검증 구매가 있는 고유 세션 / 방문 세션. 주문 건수·매출은 별도로 집계합니다. 데모 신청은 구매가 아닙니다.
- 날짜는 서울 시간 기준이며, 조회 기간 내 방문과 후속 행동만 집계합니다. 기간 경계를 넘는 전환은 제외됩니다.
- UTM source는 해당 세션의 첫 페이지 방문을 기준으로 합니다. 미설정은 `direct`로 표시합니다.
- 수집 시각은 서버 수신 시각입니다. 오프라인 재전송은 재접속 시각으로 집계됩니다. 최대 100건을 브라우저에 임시 저장하며 같은 이벤트 ID를 재사용해 중복을 방지합니다.
- 분석 동의를 거절/철회하면 새 수집과 미전송 큐를 삭제합니다. 이미 서버에 수집된 데이터의 삭제와 보관 기간은 운영자가 정책에 맞게 관리해야 합니다.

유입 링크 예시:

`https://ancoded1234.github.io/pnu-halloween/?utm_source=instagram&utm_medium=social&utm_campaign=halloween`

## 운영자 설정

실제 데이터 화면은 `/admin.html`입니다. 데모 모드의 숫자는 설명용 고정값이며 실제 데이터와 섞이지 않습니다. Supabase Authentication에서 운영자 사용자를 만든 후 SQL Editor 또는 신뢰할 수 있는 서버에서 권한을 부여하세요. 권한을 부여한 뒤 다시 로그인해야 합니다.

```sql
update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"pnu_admin": true}'::jsonb
where email = 'YOUR_OPERATOR_EMAIL';
```

공개 방문자는 검증된 행동 이벤트를 `pnu_collect`로 전송할 수 있지만, 원본 데이터 조회·수정·삭제 및 구매 데이터 기록은 허용되지 않습니다. 운영자 집계 함수는 서버에서 검증되는 app_metadata 권한을 확인합니다. 브라우저의 운영자 토큰은 메모리에만 두며 새로고침 시 다시 로그인합니다.

## 실제 행사 및 결제 연결

현재 날짜·장소·프로그램·가격은 예시이며, 실제 예약이나 결제는 발생하지 않습니다. 운영 전 `public/index.html`의 행사 정보를 확정하고 신청 흐름을 실제 결제사와 연결해야 합니다.

1. 서버에서 주문을 생성하고 무작위 세션 ID와 주문을 매핑합니다.
2. 결제사 웹훅의 서명, 결제 상태, 금액, 통화 및 서버 주문을 검증합니다.
3. 검증된 서버만 service_role로 `pnu_purchases(provider_payment_id, session_id, amount_krw, paid_at)`를 기록합니다. 결제 ID의 unique 제약이 웹훅 재전송 중복을 막습니다.
4. 구매 데이터는 동의한 세션에 연결된 경우만 분석 분모·분자에 포함됩니다. 결제 자체는 분석 동의에 종속시키지 않아야 합니다.

결제사·상품·서버 비밀키가 제공되지 않아 실제 결제 연동은 포함되지 않았습니다. 클라이언트의 완료 버튼이나 리다이렉트 쿼리로 구매를 인정하지 않습니다.

공개 수집 API의 이벤트는 비인증 행동 데이터라 위조 가능성이 있습니다. 대규모 운영 시 Edge Function/API gateway의 요청 제한 및 봇 방어를 추가하세요. 이 데이터는 정산 원장이 아닙니다.

## 구조

`public/`: 랜딩·신청·동의 UI·운영 대시보드·브라우저 수집기

`supabase/migrations/`: RLS 적용 테이블 및 권한 제한 RPC

`tests/`: 동의·중복·실패 재전송 테스트, 브라우저 사용자 흐름 검증

구현 기준: [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [GitHub Pages Actions](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).

보안 검사에서 RLS 정책 없음은 원본 테이블을 전면 비공개로 둔 의도된 설정입니다. [SECURITY DEFINER 공개 실행 알림](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable)은 허용된 이벤트만 받는 수집 RPC에 해당하며, [로그인 사용자 실행 알림](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable)은 수집 RPC 및 내부 운영자 권한을 검사하는 집계 RPC에 해당합니다. 원본 테이블 직접 접근과 익명 대시보드 실행은 차단됨을 DB 권한 검사로 확인했습니다.
