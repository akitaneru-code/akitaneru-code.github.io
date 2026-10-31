# Simple Personal Wiki (Jekyll)

아주 간단한 개인용 위키 사이트입니다.

## 특징
- 마크다운/위키 문법 없음 (나중에 직접 추가 가능)
- GitHub 로그인 (데모에서는 `akitaneru-code` 계정만 허용하는 시뮬레이션)
- 로그인 후 헤더 오른쪽 프로필 사진 표시
- 마이페이지에서 프로필 사진 업로드 (기기에서 선택), 사용자 문서, 기여 내역
- 문서 하단에 포럼 형식 댓글 + 답글 지원
- 데이터는 모두 브라우저 localStorage에 저장 (서버 없음)

## 실행 방법

1. Jekyll이 설치되어 있어야 합니다.
   ```bash
   gem install bundler jekyll
   ```

2. 이 폴더로 이동 후:
   ```bash
   jekyll serve
   ```

3. 브라우저에서 http://127.0.0.1:4000 접속

## 실제 GitHub OAuth로 바꾸려면

현재는 버튼을 누르면 바로 로그인되는 시뮬레이션입니다.

진짜로 하려면:
1. GitHub Developer Settings에서 OAuth App 생성
2. Client ID / Secret 발급
3. 콜백을 처리할 작은 서버(또는 Netlify/Vercel Function) 필요
4. 로그인 후 반환된 username이 `akitaneru-code`인지 확인하는 로직 추가

개인 위키라서 시뮬레이션으로도 충분합니다.

## 파일 구조
```
.
├── _config.yml
├── _layouts/default.html
├── assets/
│   ├── css/style.css
│   └── js/main.js
├── index.html
├── login.html
├── mypage.html
└── pages/sample.html
```
