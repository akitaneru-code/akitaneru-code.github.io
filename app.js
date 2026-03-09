import { 
  initializeFirebase, 
  signup, 
  login, 
  logout, 
  savePage, 
  getUserPages, 
  deletePage, 
  onAuthChange, 
  getCurrentUser 
} from './auth.js';
import { parseNamuMark, NAMU_MARK_GUIDE } from './namu-mark.js';

// Initialize Firebase
initializeFirebase();

// Get DOM elements
const authScreen = document.getElementById('auth-screen');
const appScreen = document.getElementById('app-screen');
const loginTab = document.getElementById('login-tab');
const signupTab = document.getElementById('signup-tab');
const loginForm = document.getElementById('login-form');
const signupForm = document.getElementById('signup-form');
const loginEmail = document.getElementById('login-email');
const loginPassword = document.getElementById('login-password');
const signupEmail = document.getElementById('signup-email');
const signupPassword = document.getElementById('signup-password');
const signupPasswordConfirm = document.getElementById('signup-password-confirm');
const loginError = document.getElementById('login-error');
const signupError = document.getElementById('signup-error');
const logoutBtn = document.getElementById('logout-btn');
const userEmail = document.getElementById('user-email');
const createPageForm = document.getElementById('create-page-form');
const pageTitle = document.getElementById('page-title');
const pageContent = document.getElementById('page-content');
const createError = document.getElementById('create-error');
const pagesList = document.getElementById('pages-list');

// Tab switching
loginTab.addEventListener('click', () => {
  loginTab.classList.add('active');
  signupTab.classList.remove('active');
  loginForm.classList.add('active');
  signupForm.classList.remove('active');
  clearErrors();
});

signupTab.addEventListener('click', () => {
  signupTab.classList.add('active');
  loginTab.classList.remove('active');
  signupForm.classList.add('active');
  loginForm.classList.remove('active');
  clearErrors();
});

// Login form submission
loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = loginEmail.value.trim();
  const password = loginPassword.value;

  if (!email || !password) {
    showError(loginError, '이메일과 비밀번호를 입력해주세요');
    return;
  }

  const result = await login(email, password);
  if (result.success) {
    loginEmail.value = '';
    loginPassword.value = '';
    showApp();
  } else {
    showError(loginError, result.error);
  }
});

// Signup form submission
signupForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = signupEmail.value.trim();
  const password = signupPassword.value;
  const passwordConfirm = signupPasswordConfirm.value;

  if (!email || !password || !passwordConfirm) {
    showError(signupError, '모든 필드를 입력해주세요');
    return;
  }

  if (password !== passwordConfirm) {
    showError(signupError, '비밀번호가 일치하지 않습니다');
    return;
  }

  if (password.length < 6) {
    showError(signupError, '비밀번호는 최소 6글자 이상이어야 합니다');
    return;
  }

  const result = await signup(email, password);
  if (result.success) {
    signupEmail.value = '';
    signupPassword.value = '';
    signupPasswordConfirm.value = '';
    showError(signupError, '회원가입 성공! 로그인해주세요');
    signupError.classList.remove('show');
    loginEmail.value = email;
    loginTab.click();
  } else {
    showError(signupError, result.error);
  }
});

// Logout button
logoutBtn.addEventListener('click', async () => {
  const result = await logout();
  if (result.success) {
    showAuth();
    clearForms();
  }
});

// Create page form submission
createPageForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const title = pageTitle.value.trim();
  const content = pageContent.value.trim();

  if (!title || !content) {
    showError(createError, '제목과 내용을 입력해주세요');
    return;
  }

  const result = await savePage(title, content);
  if (result.success) {
    pageTitle.value = '';
    pageContent.value = '';
    createError.classList.remove('show');
    loadUserPages();
  } else {
    showError(createError, result.error);
  }
});

// Load and display user pages
async function loadUserPages() {
  const result = await getUserPages();
  pagesList.innerHTML = '';

  if (result.success && result.pages.length > 0) {
    result.pages.forEach((page) => {
      const pageItem = document.createElement('div');
      pageItem.className = 'page-item';
      
      const titleSpan = document.createElement('span');
      titleSpan.className = 'page-item-title';
      titleSpan.textContent = page.title;
      titleSpan.style.cursor = 'pointer';
      titleSpan.addEventListener('click', () => {
        displayPage(page);
      });

      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'page-item-delete';
      deleteBtn.textContent = '×';
      deleteBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (confirm('이 문서를 삭제하시겠습니까?')) {
          const delResult = await deletePage(page.id);
          if (delResult.success) {
            loadUserPages();
          } else {
            alert('삭제 실패: ' + delResult.error);
          }
        }
      });

      pageItem.appendChild(titleSpan);
      pageItem.appendChild(deleteBtn);
      pagesList.appendChild(pageItem);
    });
  } else if (result.success) {
    pagesList.innerHTML = '<p style="color: #999; font-size: 14px;">저장된 문서가 없습니다</p>';
  }
}

// Display page content
function displayPage(page) {
  const appDiv = document.getElementById('app');
  const renderedContent = parseNamuMark(page.content);
  appDiv.innerHTML = `
    <h2>${escapeHtml(page.title)}</h2>
    <div style="color: #999; font-size: 12px; margin-bottom: 20px;">
      작성일: ${new Date(page.createdAt).toLocaleDateString('ko-KR')}
    </div>
    <div style="line-height: 1.6;">
      ${renderedContent}
    </div>
  `;
}

// Show auth screen
function showAuth() {
  authScreen.classList.add('active');
  appScreen.classList.remove('active');
}

// Show app screen
function showApp() {
  authScreen.classList.remove('active');
  appScreen.classList.add('active');
  loadUserPages();
}

// Show error message
function showError(element, message) {
  element.textContent = message;
  element.classList.add('show');
}

// Clear all forms
function clearForms() {
  loginEmail.value = '';
  loginPassword.value = '';
  signupEmail.value = '';
  signupPassword.value = '';
  signupPasswordConfirm.value = '';
  pageTitle.value = '';
  pageContent.value = '';
}

// Clear errors
function clearErrors() {
  loginError.classList.remove('show');
  signupError.classList.remove('show');
  createError.classList.remove('show');
}

// Escape HTML for safety
function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, m => map[m]);
}

// Show Namu Mark guide
function showNamuMarkGuide() {
  const appDiv = document.getElementById('app');
  const guide = parseNamuMark(NAMU_MARK_GUIDE);
  appDiv.innerHTML = `
    <div style="background: #f9f9f9; padding: 20px; border-radius: 4px; border-left: 4px solid #667eea;">
      ${guide}
    </div>
  `;
}

// Add guide button to page list
const guideBtn = document.createElement('button');
guideBtn.textContent = '나무마크 문법';
guideBtn.className = 'btn btn-secondary';
guideBtn.style.width = '100%';
guideBtn.style.marginBottom = '12px';
guideBtn.addEventListener('click', showNamuMarkGuide);
const pagesSection = document.querySelector('.page-section');
pagesSection.insertBefore(guideBtn, pagesSection.querySelector('.pages-list'));

// Monitor auth state
onAuthChange((user) => {
  if (user) {
    userEmail.textContent = user.email;
    showApp();
  } else {
    showAuth();
  }
});
