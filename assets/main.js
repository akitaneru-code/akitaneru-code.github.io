// 간단한 개인 위키용 상태 관리 (localStorage 기반)
// 실제 GitHub OAuth는 서버가 필요해서, 여기서는 akitaneru-code 전용 시뮬레이션으로 구현

const STORAGE_KEYS = {
  loggedIn: 'wiki_logged_in',
  username: 'wiki_username',
  avatar: 'wiki_avatar',
  comments: 'wiki_comments',
  userDoc: 'wiki_user_doc'
};

const ALLOWED_USER = 'akitaneru-code';

// 유틸
function getLoggedIn() {
  return localStorage.getItem(STORAGE_KEYS.loggedIn) === 'true';
}

function getUsername() {
  return localStorage.getItem(STORAGE_KEYS.username) || '';
}

function getAvatar() {
  return localStorage.getItem(STORAGE_KEYS.avatar) || '';
}

function setLoggedIn(username) {
  localStorage.setItem(STORAGE_KEYS.loggedIn, 'true');
  localStorage.setItem(STORAGE_KEYS.username, username);
}

function logout() {
  localStorage.removeItem(STORAGE_KEYS.loggedIn);
  localStorage.removeItem(STORAGE_KEYS.username);
  // 아바타는 유지 (개인위키니까)
  location.reload();
}

// 헤더 유저 영역 렌더
function renderUserArea() {
  const area = document.getElementById('user-area');
  if (!area) return;

  if (getLoggedIn()) {
    const avatar = getAvatar();
    const imgSrc = avatar || 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"%3E%3Ccircle cx="50" cy="50" r="50" fill="%23ddd"/%3E%3Ccircle cx="50" cy="40" r="18" fill="%23999"/%3E%3Cpath d="M20 80 Q50 60 80 80" fill="%23999"/%3E%3C/svg%3E';
    
    area.innerHTML = `
      <img src="${imgSrc}" alt="프로필" class="profile-pic" id="header-profile" title="마이페이지">
    `;
    document.getElementById('header-profile').addEventListener('click', () => {
      window.location.href = '/mypage/';
    });
  } else {
    area.innerHTML = `
      <button class="login-btn" id="header-login-btn">
        <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
        GitHub 로그인
      </button>
    `;
    document.getElementById('header-login-btn').addEventListener('click', () => {
      window.location.href = '/login/';
    });
  }
}

// 로그인 페이지 처리
function initLoginPage() {
  const btn = document.getElementById('github-login-btn');
  if (!btn) return;

  btn.addEventListener('click', () => {
    // 실제로는 GitHub OAuth 리다이렉트가 필요함.
    // 여기서는 개인위키 특성상 akitaneru-code 전용으로 바로 로그인 처리.
    // 실제 OAuth를 붙이려면 GitHub OAuth App을 만들고 서버(또는 Netlify Function 등)에서 코드 교환을 해야 함.
    
    // 시뮬레이션: 허용된 계정으로 로그인
    setLoggedIn(ALLOWED_USER);
    
    // 기본 사용자문서가 없으면 생성
    if (!localStorage.getItem(STORAGE_KEYS.userDoc)) {
      localStorage.setItem(STORAGE_KEYS.userDoc, '안녕하세요! 여기는 ' + ALLOWED_USER + '의 사용자 문서입니다.\n\n이곳에 자기소개나 메모를 적을 수 있어요.');
    }
    
    alert('GitHub 계정 (' + ALLOWED_USER + ')으로 로그인되었습니다!');
    window.location.href = '/';
  });
}

// 마이페이지
function initMyPage() {
  if (!document.getElementById('mypage-content')) return;

  if (!getLoggedIn()) {
    document.getElementById('mypage-content').innerHTML = `
      <div class="mypage-card">
        <p>로그인이 필요합니다.</p>
        <a href="/login/">로그인 하러 가기</a>
      </div>
    `;
    return;
  }

  const username = getUsername();
  const avatar = getAvatar();
... 
