// src/app.js
// Main application script extracted from index.html for easier documentation and CI.

import DOMPurify from 'https://cdn.jsdelivr.net/npm/dompurify@2.4.0/dist/purify.es.js'

// --- data structures ---
let pages = {"환영합니다": "= 환영합니다 =\n\n담비위키에 오신 것을 환영합니다.\n\n== 사용법 ==\n* 왼쪽에서 문서를 선택하거나 새 문서를 만드세요.\n* 편집 후 저장하면 서버에 업로드됩니다."}
let pagesMeta = {}
let pagesTranslations = {} // pagesTranslations[title] = { lang: content }
let trash = {}
let pagesHistory = {}
let deletionLog = []
let users = []
let currentPage = '환영합니다'
let currentLang = 'ko'
let user = null

// DOM cache
const pageListEl = document.getElementById('pageList')
const pageTitleEl = document.getElementById('pageTitle')
const pageContentEl = document.getElementById('pageContent')
const editArea = document.getElementById('editArea')
const editTitle = document.getElementById('editTitle')
const editContent = document.getElementById('editContent')
const editBtn = document.getElementById('editBtn')
const historyBtn = document.getElementById('historyBtn')
const saveBtn = document.getElementById('saveBtn')
const cancelBtn = document.getElementById('cancelBtn')
const deleteBtn = document.getElementById('deleteBtn')
const commentsList = document.getElementById('commentsList')
const commentInput = document.getElementById('commentInput')
const authArea = document.getElementById('authArea')
const loginBtn = document.getElementById('loginBtn')
const signupBtn = document.getElementById('signupBtn')
const openTrashBtn = document.getElementById('openTrashBtn')
const toastEl = document.getElementById('toast')
const langSelect = document.getElementById('langSelect')
const tocContainer = document.getElementById('tocContainer')
const autosaveStatus = document.getElementById('autosaveStatus')

let adminEmail = localStorage.getItem('dambi_wiki_admin') || null

// autosave state
let autosaveTimer = null
let editStartUpdatedAt = null

// util
export function showToast(msg, ms=3000){ toastEl.textContent = msg; toastEl.style.display='block'; setTimeout(()=>{ toastEl.style.display='none' }, ms) }
function escapeHtml(s){return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}

function wrapListGroups(html){
  return html.replace(/(<li>[\s\S]*?<\/li>)(?:\s*<li>[\s\S]*?<\/li>)*/g, function(group){
    const lis = group.match(/<li>[\s\S]*?<\/li>/g)
    if(!lis) return group
    return '<ul>'+lis.join('')+'</ul>'
  })
}

/**
 * Parse multiline footnote definitions and return object mapping id->content
 */
function extractFootnotes(text){
  const footnotes = {}
  // Find lines starting with [^id]: and capture following indented or non-empty lines until a blank line
  const lines = text.split('\n')
  let i=0
  while(i<lines.length){
    const line = lines[i]
    const m = line.match(/^\[\^(.+?)\]:\s*(.*)$/)
    if(m){
      const id = m[1]
      let content = m[2] || ''
      i++
      // capture subsequent indented lines or lines until blank
      while(i<lines.length && lines[i].trim() !== ''){
        // if next line is indented or starts with whitespace, include
        content += '\n' + lines[i]
        i++
      }
      footnotes[id] = content.trim()
    } else i++
  }
  return footnotes
}

/**
 * Convert namumark (extended) to HTML with: footnotes, tables with colspan/rowspan, templates, TOC placeholder
 */
export function namumarkToHTML(text){
  text = text || ''
  const footnotes = extractFootnotes(text)
  // strip footnote definitions from body
  text = text.replace(/^\[\^(.+?)\]:[\s\S]*?(?=\n\n|$)/gm, '')

  // code blocks
  text = text.replace(/```([\s\S]*?)```/g, function(m,p){ return '<pre><code>'+escapeHtml(p)+'</code></pre>' })

  // headings
  text = text.replace(/^======\s*(.*?)\s*======$/gm,'<h1>$1</h1>')
  text = text.replace(/^=====\s*(.*?)\s*=====$/gm,'<h2>$1</h2>')
  text = text.replace(/^====\s*(.*?)\s*====$/gm,'<h3>$1</h3>')
  text = text.replace(/^===\s*(.*?)\s*===$/gm,'<h4>$1</h4>')
  text = text.replace(/^==\s*(.*?)\s*==$/gm,'<h5>$1</h5>')
  text = text.replace(/^=\s*(.*?)\s*=$/gm,'<h6>$1</h6>')

  text = text.replace(/^----$/gm,'<hr>')

  text = text.replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')
  text = text.replace(/''(.+?)''/g,'<em>$1</em>')
  text = text.replace(/^>\s?(.*)$/gm,'<blockquote>$1</blockquote>')

  // internal links
  text = text.replace(/\[\[(.+?)\]\]/g,function(_,p){ return '<a href="/'+encodeURIComponent(p)+'/'+currentLang+'" onclick="event.preventDefault();window.appLoadPage(\''+p.replace(/'/g,"\\'")+"',window.currentLang);">'+p+'</a>' })

  // external links
  text = text.replace(/\[(https?:\/\/.+?)\s+(.+?)\]/g,'<a href="$1" target="_blank" rel="noopener">$2</a>')

  // images
  text = text.replace(/\[파일:(.+?)\]/g,'<img src="$1" style="max-width:100%;border-radius:6px">')

  // tables: support attributes in cell like {colspan=2,rowspan=3,align=center}
  text = text.replace(/^\|\|(.+?)\|\|$/gm, function(match){
    const raw = match.slice(2,-2)
    const cells = raw.split('||').map(cell=>{
      let c = cell.trim()
      let attrs = {}
      const attrMatch = c.match(/^\{([^}]+)\}\s*(.*)$/)
      if(attrMatch){
        const attrStr = attrMatch[1]
        c = attrMatch[2]
        attrStr.split(',').forEach(pair=>{
          const [k,v] = pair.split('=').map(s=>s.trim())
          attrs[k]=v||true
        })
      }
      const tag = c.startsWith('!') ? 'th' : 'td'
      const content = (tag==='th')? c.slice(1).trim() : c
      let attrHtml = ''
      if(attrs.colspan) attrHtml += ' colspan="'+attrs.colspan+'"'
      if(attrs.rowspan) attrHtml += ' rowspan="'+attrs.rowspan+'"'
      const alignClass = attrs.align ? ' class="align-'+attrs.align+'"' : ''
      return `<${tag}${attrHtml}${alignClass}>${content}</${tag}>`
    }).join('')
    return '<tr>'+cells+'</tr>'
  })

  // lists
  text = text.replace(/^\-\s+(.+)$/gm,'<li>$1</li>')
  text = text.replace(/^\*\s+(.+)$/gm,'<li>$1</li>')
  text = text.replace(/^\d+\.\s+(.+)$/gm,'<li>$1</li>')

  // templates (TOC placeholder)
  text = text.replace(/\{\{\s*TOC\s*\}\}/gi, '<div class="template-TOC"></div>')

  // footnote markers
  const footnoteOrder = []
  text = text.replace(/\[\^(.+?)\]/g, function(_, id){ if(!(id in footnotes)) return '';
    let idx = footnoteOrder.indexOf(id)
    if(idx === -1){ footnoteOrder.push(id); idx = footnoteOrder.length }
    return '<sup id="fnref-'+escapeHtml(id)+'"><a href="#fn-'+escapeHtml(id)+'">['+idx+']</a></sup>'
  })

  // newline to <br>
  text = text.replace(/\n/g,'<br>')

  text = wrapListGroups(text)
  let html = DOMPurify.sanitize(text, {ALLOWED_TAGS:['h1','h2','h3','h4','h5','h6','strong','em','a','img','br','ul','li','ol','pre','code','blockquote','hr','table','tr','td','th','sup','div','span']})

  if(footnoteOrder.length>0){
    let fnHtml = '<section class="footnotes"><ol>'
    footnoteOrder.forEach(id=>{ fnHtml += '<li id="fn-'+escapeHtml(id)+'">'+DOMPurify.sanitize(footnotes[id])+' <a href="#fnref-'+escapeHtml(id)+'">↩</a></li>' })
    fnHtml += '</ol></section>'
    html += fnHtml
  }

  return html
}

// persistence
export function saveAllToLocal(){
  localStorage.setItem('dambi_wiki_pages', JSON.stringify(pages))
  localStorage.setItem('dambi_wiki_meta', JSON.stringify(pagesMeta))
  localStorage.setItem('dambi_wiki_translations', JSON.stringify(pagesTranslations))
  localStorage.setItem('dambi_wiki_trash', JSON.stringify(trash))
  localStorage.setItem('dambi_wiki_history', JSON.stringify(pagesHistory))
  localStorage.setItem('dambi_wiki_deletion_log', JSON.stringify(deletionLog))
  localStorage.setItem('dambi_wiki_users', JSON.stringify(users))
}

export function loadAllFromLocal(){
  try{ if(localStorage.getItem('dambi_wiki_pages')) pages = JSON.parse(localStorage.getItem('dambi_wiki_pages')) }catch(e){}
  try{ if(localStorage.getItem('dambi_wiki_meta')) pagesMeta = JSON.parse(localStorage.getItem('dambi_wiki_meta')) }catch(e){}
  try{ if(localStorage.getItem('dambi_wiki_translations')) pagesTranslations = JSON.parse(localStorage.getItem('dambi_wiki_translations')) }catch(e){}
  try{ if(localStorage.getItem('dambi_wiki_trash')) trash = JSON.parse(localStorage.getItem('dambi_wiki_trash')) }catch(e){}
  try{ if(localStorage.getItem('dambi_wiki_history')) pagesHistory = JSON.parse(localStorage.getItem('dambi_wiki_history')) }catch(e){}
  try{ if(localStorage.getItem('dambi_wiki_deletion_log')) deletionLog = JSON.parse(localStorage.getItem('dambi_wiki_deletion_log')) }catch(e){}
  try{ if(localStorage.getItem('dambi_wiki_users')) users = JSON.parse(localStorage.getItem('dambi_wiki_users')) }catch(e){}
}

export function updateTrashButton(){ const cnt = Object.keys(trash).length; openTrashBtn.textContent = '휴지통 ('+cnt+')' }

export function renderPageList(){ pageListEl.innerHTML=''; Object.keys(pages).sort().forEach(title=>{ const a=document.createElement('a');a.href='#';a.textContent=title;a.className=(title===currentPage)?'active':'';a.onclick=(e)=>{e.preventDefault();appLoadPage(title,currentLang)};pageListEl.appendChild(a) }); updateTrashButton() }

export function findBacklinks(title){ const backlinks = []; Object.keys(pages).forEach(t=>{ if(t===title) return; if((pages[t]||'').includes('[['+title+']]')) backlinks.push(t) }); return backlinks }

/**
 * Load page with optional language. If translation exists use it, else show original with banner.
 */
export function appLoadPage(title, lang='ko'){
  if(!pages[title]) return alert('문서를 찾을 수 없습니다.');
  currentPage = title; currentLang = lang
  pageTitleEl.textContent = title
  // pick content: translation if available
  const transFor = pagesTranslations[title]||{}
  let content = transFor[lang] || pages[title]
  let html = namumarkToHTML(content)
  pageContentEl.innerHTML = html
  renderTOC()
  renderPageList()
  loadComments(title)
  // show translation notice
  const notice = document.createElement('div')
  notice.style.fontSize='0.9rem'; notice.style.color='#64748b'; notice.style.marginTop='6px'
  if(lang !== 'ko' && !transFor[lang]){
    notice.innerHTML = '이 문서는 아직 '+lang+' 번역본이 없습니다. "번역하기"로 번역을 추가할 수 있습니다.'
    const btn = document.createElement('button'); btn.textContent='번역하기'; btn.className='btn'; btn.style.marginLeft='8px'; btn.onclick=()=>{ startTranslation(title, lang) }
    notice.appendChild(btn)
  }
  pageContentEl.prepend(notice)
  pageTitleEl.innerHTML = escapeHtml(title) + (pagesMeta[title] && pagesMeta[title].owner?('<span class="meta-badge">작성자: '+escapeHtml(pagesMeta[title].owner)+'</span>'):'')
  // update URL
  const path = '/'+encodeURIComponent(title)+'/'+lang
  history.replaceState({}, '', path)
}

export function onLangChange(lang){ currentLang = lang; appLoadPage(currentPage, lang) }

export function startTranslation(title, lang){ // open editor but edit translation content
  editArea.style.display='block'; editBtn.style.display='none'; saveBtn.style.display='inline-block'; cancelBtn.style.display='inline-block'; editTitle.value = title; const trans = (pagesTranslations[title]||{})[lang] || '';
  // if no translation, start from original or empty
  editContent.value = trans || pages[title]
  // mark edit start timestamp for conflict detection
  editStartUpdatedAt = pagesMeta[title] ? pagesMeta[title].updatedAt : null
}

export function editPage(){ const meta = pagesMeta[currentPage] || {}; if(meta.owner){ if(!user || (user.email !== meta.owner && user.email !== adminEmail)){ return alert('수정 권한이 없습니다. 문서 소유자 또는 관리자만 수정할 수 있습니다.') } }
  editArea.style.display='block'; editBtn.style.display='none'; saveBtn.style.display='inline-block'; cancelBtn.style.display='inline-block'; editTitle.value=currentPage; // if editing translation language, load that
  const transFor = pagesTranslations[currentPage]||{}
  editContent.value = transFor[currentLang] || pages[currentPage] || ''
  editStartUpdatedAt = pagesMeta[currentPage] ? pagesMeta[currentPage].updatedAt : null
  startAutosave()
}

export function cancelEdit(){ editArea.style.display='none'; editBtn.style.display='inline-block'; saveBtn.style.display='none'; cancelBtn.style.display='none'; stopAutosave(); autosaveStatus.textContent='-'; }

/**
 * Save page or translation. If editing a translation, save under pagesTranslations. Performs conflict detection.
 */
export async function savePage(){ const newTitle = editTitle.value.trim(); const content = editContent.value; if(!newTitle) return alert('제목을 입력하세요');
  // detect conflict
  const meta = pagesMeta[currentPage]
  if(meta && editStartUpdatedAt && meta.updatedAt && meta.updatedAt !== editStartUpdatedAt){
    const ok = confirm('문서가 다른 곳에서 변경되었습니다. 현재 편집 내용으로 덮어쓰시겠습니까? 취소하면 내용 비교 화면이 나옵니다.')
    if(!ok){ // show both contents
      alert('서버(로컬Storage) 버전과 편집 중인 버전을 비교하여 수동으로 병합하세요.')
      return
    }
  }

  // if title changed
  if(newTitle !== currentPage){ if(pagesMeta[currentPage]) pagesMeta[newTitle] = pagesMeta[currentPage]; delete pages[currentPage]; delete pagesMeta[currentPage]; if(pagesHistory[currentPage]){ pagesHistory[newTitle] = pagesHistory[currentPage]; delete pagesHistory[currentPage]; } }

  // if saving translation (lang != default)
  if(currentLang && currentLang !== 'ko'){
    pagesTranslations[newTitle] = pagesTranslations[newTitle]||{}
    pagesTranslations[newTitle][currentLang] = content
  } else {
    // push history
    if(pages[currentPage]){ pagesHistory[currentPage] = pagesHistory[currentPage]||[]; pagesHistory[currentPage].push({content: pages[currentPage], author: (user&&user.email)||'익명', timestamp: Date.now(), message: '자동 저장된 이전 버전'}) }
    pages[newTitle] = content
    const now = Date.now()
    if(!pagesMeta[newTitle]) pagesMeta[newTitle] = { owner: (user&&user.email)||null, createdAt: now, updatedAt: now }
    else pagesMeta[newTitle].updatedAt = now
  }

  currentPage = newTitle
  saveAllToLocal()
  cancelEdit()
  renderPageList()
  appLoadPage(newTitle, currentLang)
  showToast('저장되었습니다.')
}

export function openHistory(){ const title = currentPage; const history = pagesHistory[title]||[]; pageTitleEl.textContent = '히스토리: '+title; let html = '<div style="background:#fff;padding:12px;border-radius:8px">'; if(history.length===0) html += '<p>이 문서의 히스토리가 없습니다.</p>'; else{ html += '<ol>'; history.slice().reverse().forEach((h,idx)=>{ const i = history.length-1-idx; html += '<li style="margin-bottom:10px">작성자: '+escapeHtml(h.author)+' • '+new Date(h.timestamp).toLocaleString()+'<br><pre style="background:#f8fafc;padding:8px;border-radius:6px;white-space:pre-wrap">'+escapeHtml(h.content)+'</pre><button onclick="window.restoreVersion(\''+encodeURIComponent(title)+'\','+i+')">이 버전으로 복원</button></li>' }); html += '</ol>' } html += '</div>'; pageContentEl.innerHTML = html }

export function restoreVersion(encodedTitle, index){ const title = decodeURIComponent(encodedTitle); const history = pagesHistory[title]||[]; if(!history[index]) return alert('버전을 찾을 수 없습니다'); pagesHistory[title] = pagesHistory[title]||[]; pagesHistory[title].push({content: pages[title], author: (user&&user.email)||'익명', timestamp: Date.now(), message: '복원 전 버전'}); pages[title] = history[index].content; pagesMeta[title].updatedAt = Date.now(); saveAllToLocal(); renderPageList(); appLoadPage(title, currentLang); showToast('해당 버전으로 복원되었습니다.') }

export function newPage(){ const title=prompt('새 문서 제목을 입력하세요:'); if(title && !pages[title]){ pages[title]='= '+title+' =\n\n내용을 입력하세요.'; const now=Date.now(); pagesMeta[title]={owner:(user&&user.email)||null,createdAt:now,updatedAt:now}; pagesHistory[title]=[]; saveAllToLocal(); renderPageList(); appLoadPage(title,currentLang); showToast('문서가 생성되었습니다.') } }

export function searchPages(){ const term=document.getElementById('globalSearch').value.toLowerCase(); document.querySelectorAll('.page-list a').forEach(a=>{a.style.display=a.textContent.toLowerCase().includes(term)?'block':'none'}) }

export function loadComments(page){ commentsList.innerHTML=''; const all = JSON.parse(localStorage.getItem('dambi_wiki_comments')||'{}'); const comments = all[page]||[]; comments.forEach(c=>{ const div=document.createElement('div');div.className='comment';div.innerHTML='<div class="meta">'+escapeHtml(c.user||'익명')+' • '+new Date(c.created).toLocaleString()+'</div><div class="body">'+DOMPurify.sanitize(c.text)+'</div>'; commentsList.appendChild(div) }) }

export function postComment(){ const text=commentInput.value.trim(); if(!text) return alert('댓글 내용을 입력하세요'); const all = JSON.parse(localStorage.getItem('dambi_wiki_comments')||'{}'); all[currentPage]=all[currentPage]||[]; all[currentPage].push({user:(user&&user.email)||'익명',text:text,created:Date.now()}); localStorage.setItem('dambi_wiki_comments',JSON.stringify(all)); commentInput.value=''; loadComments(currentPage); showToast('댓글이 등록되었습니다.') }

export async function uploadFile(){ const f = document.getElementById('fileInput').files[0]; if(!f) return alert('파일을 선택하세요'); document.getElementById('uploadStatus').textContent='업로드 중...'; const url = URL.createObjectURL(f); const insert = '\n[파일:'+url+']\n'; editContent.value = editContent.value + '\n' + insert; document.getElementById('uploadStatus').textContent='업로드 완료 (임시 URL)'; showToast('파일이 임시로 업로드되었습니다.') }

export function deletePage(){ const title = currentPage; const meta = pagesMeta[title] || {}; if(meta.owner){ if(!user || (user.email !== meta.owner && user.email !== adminEmail)){ return alert('삭제 권한이 없습니다. 문서 소유자 또는 관리자만 삭제할 수 있습니다.') } } else { if(!user || user.email !== adminEmail){ return alert('소유자가 설정되지 않은 문서는 관리자만 삭제할 수 있습니다.') } }
  const backlinks = findBacklinks(title); if(backlinks.length>0){ if(!confirm('다음 문서들이 "'+title+'"을(를) 링크하고 있습니다:\n- '+backlinks.join('\n- ')+'\n\n계속 삭제하시겠습니까?')) return } else { if(!confirm('"'+title+'" 문서를 휴지통으로 이동하시겠습니까?')) return }
  const reason = prompt('삭제 이유를 입력하세요 (선택):') || '';
  const allComments = JSON.parse(localStorage.getItem('dambi_wiki_comments')||'{}'); const commentsForPage = allComments[title]||[];
  trash[title] = { content: pages[title], meta: pagesMeta[title]||null, comments: commentsForPage, deletedBy: (user&&user.email)||'익명', deletedAt: Date.now(), reason: reason, backlinks: backlinks }
  delete pages[title]; delete pagesMeta[title]; if(allComments[title]){ delete allComments[title]; localStorage.setItem('dambi_wiki_comments', JSON.stringify(allComments)) }
  deletionLog.push({title:title, deletedBy:(user&&user.email)||'익명', deletedAt: Date.now(), reason:reason, backlinks:backlinks})
  saveAllToLocal()
  const keys = Object.keys(pages)
  if(keys.length===0){ pages['환영합니다'] = '= 환영합니다 =\n\n새 문서를 시작합니다.'; pagesMeta['환영합니다'] = { owner: null, createdAt: Date.now(), updatedAt: Date.now() }; saveAllToLocal(); renderPageList(); appLoadPage('환영합니다',currentLang) } else { renderPageList(); appLoadPage(keys[0],currentLang) }
  showToast('문서를 휴지통으로 이동했습니다.') }

export function openTrash(){ pageTitleEl.textContent = '휴지통'; let html = '<div style="background:#fff;padding:12px;border-radius:8px">'; const keys = Object.keys(trash); if(keys.length===0) html += '<p>휴지통이 비어 있습니다.</p>'; else{ html += '<ul>'; keys.forEach(t=>{ const item = trash[t]; html += '<li style="margin-bottom:8px"><strong>'+escapeHtml(t)+'</strong> — 삭제자: '+escapeHtml(item.deletedBy)+' • '+new Date(item.deletedAt).toLocaleString()+'<br>사유: '+escapeHtml(item.reason)+'<br>백링크: '+(item.backlinks&&item.backlinks.join(', ')||'없음')+" <div style='margin-top:6px'><button onclick=\"window.restorePage('"+encodeURIComponent(t)+"')\">복원</button> <button onclick=\"window.permanentlyDeletePage('"+encodeURIComponent(t)+"')\" style='margin-left:6px;background:#e11d48;color:#fff'>완전삭제</button></div></li>" }); html += '</ul>' } html += '</div>'; pageContentEl.innerHTML = html }

export function restorePage(encodedTitle){ const title = decodeURIComponent(encodedTitle); if(!trash[title]) return alert('항목을 찾을 수 없습니다'); pages[title] = trash[title].content; if(trash[title].meta) pagesMeta[title] = trash[title].meta; const allComments = JSON.parse(localStorage.getItem('dambi_wiki_comments')||'{}'); allComments[title] = trash[title].comments || []; localStorage.setItem('dambi_wiki_comments', JSON.stringify(allComments)); delete trash[title]; saveAllToLocal(); renderPageList(); appLoadPage(title,currentLang); showToast('복원되었습니다.') }

export function permanentlyDeletePage(encodedTitle){ const title = decodeURIComponent(encodedTitle); if(!trash[title]) return alert('항목을 찾을 수 없습니다'); if(!confirm('"'+title+'"을(를) 완전 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.')) return; delete trash[title]; saveAllToLocal(); openTrash(); showToast('완전 삭제되었습니다.') }

export function openAdmin(){ if(!user || user.email !== adminEmail) return alert('관리자 전용 기능입니다.'); pageTitleEl.textContent = '관리자 콘솔'; let html = '<div style="background:#fff;padding:12px;border-radius:8px">'; html += '<h3>사용자 목록</h3>'; html += '<ul>'; users.forEach(u=>{ html += '<li>'+escapeHtml(u.email)+' <button onclick="window.adminDeleteUser(\''+encodeURIComponent(u.email)+'\')">삭제</button></li>' }); html += '</ul>'; html += '<h3>삭제 로그</h3>'; if(deletionLog.length===0) html += '<p>삭제 로그가 없습니다.</p>'; else{ html += '<ol>'; deletionLog.slice().reverse().forEach(l=>{ html += '<li>'+escapeHtml(l.title)+' — 삭제자: '+escapeHtml(l.deletedBy)+' • '+new Date(l.deletedAt).toLocaleString()+'<br>사유: '+escapeHtml(l.reason)+'<br>백링크: '+(l.backlinks&&l.backlinks.join(', ')||'없음')+'</li>' }) html += '</ol>' } html += '</div>'; pageContentEl.innerHTML = html }

export function adminDeleteUser(encodedEmail){ const email = decodeURIComponent(encodedEmail); if(!confirm(email+' 사용자를 삭제하시겠습니까?')) return; users = users.filter(u=>u.email !== email); localStorage.setItem('dambi_wiki_users', JSON.stringify(users)); showToast('사용자를 삭제했습니다.'); renderAuth(); }

// Auth handlers
loginBtn.addEventListener('click', ()=>{ const email=prompt('이메일:'); const pw=prompt('비밀번호:'); if(!email||!pw) return; const found = users.find(u=>u.email===email); if(!found){ return alert('사용자가 없습니다. 회원가입 해주세요.') } user={email:email}; localStorage.setItem('dambi_wiki_user', JSON.stringify(user)); renderAuth(); showToast('로그인 되었습니다.') })
signupBtn.addEventListener('click', ()=>{ const email=prompt('회원가입 이메일:'); const pw=prompt('비밀번호:'); if(!email||!pw) return; if(!users.find(u=>u.email===email)) users.push({email:email}); localStorage.setItem('dambi_wiki_users', JSON.stringify(users)); user={email:email}; localStorage.setItem('dambi_wiki_user', JSON.stringify(user)); if(!localStorage.getItem('dambi_wiki_admin')){ localStorage.setItem('dambi_wiki_admin', email); adminEmail = email; alert('당신은 관리자 계정으로 설정되었습니다.') } alert('회원가입 완료 (데모)'); renderAuth(); showToast('회원가입 완료') })

export function renderAuth(){ const stored = localStorage.getItem('dambi_wiki_user'); adminEmail = localStorage.getItem('dambi_wiki_admin') || null; if(stored){ user=JSON.parse(stored); let badge = (user.email===adminEmail)?' <span style="color:#fde68a">(관리자)</span>':''; authArea.innerHTML = '<div style="color:#fff">'+escapeHtml(user.email)+badge+'</div><button onclick="window.logout()" style="background:transparent;border:1px solid rgba(255,255,255,0.12);color:#fff;padding:6px 10px;border-radius:6px">로그아웃</button>';
    if(user.email===adminEmail){ const btn = document.createElement('button'); btn.textContent='관리자'; btn.className='admin-btn'; btn.style.marginLeft='8px'; btn.onclick = openAdmin; authArea.appendChild(btn) }
  }else{ authArea.innerHTML = '<button id="loginBtn">로그인</button><button id="signupBtn">회원가입</button>'; document.getElementById('loginBtn').addEventListener('click', ()=>loginBtn.click()); document.getElementById('signupBtn').addEventListener('click', ()=>signupBtn.click()) } }

export function logout(){ localStorage.removeItem('dambi_wiki_user'); user=null; renderAuth(); showToast('로그아웃되었습니다.') }

// Autosave
function autosaveKey(title, lang){ return 'dambi_autosave_'+encodeURIComponent(title)+'_'+lang }
function startAutosave(){ stopAutosave(); autosaveTimer = setInterval(()=>{
  const key = autosaveKey(editTitle.value||currentPage, currentLang||'ko')
  localStorage.setItem(key, editContent.value)
  autosaveStatus.textContent = new Date().toLocaleTimeString()
}, 5000) }
function stopAutosave(){ if(autosaveTimer) clearInterval(autosaveTimer); autosaveTimer=null }

// TOC generation
export function renderTOC(){ tocContainer.innerHTML = ''
  const headings = pageContentEl.querySelectorAll('h1,h2,h3,h4,h5,h6')
  if(headings.length===0) return
  const ul = document.createElement('ul')
  headings.forEach(h=>{
    const li = document.createElement('li')
    const id = (h.textContent||'').trim().toLowerCase().replace(/[^a-z0-9가-힣]+/g,'-')
    h.id = id
    const a = document.createElement('a')
    a.href = '#'+id
    a.textContent = h.textContent
    a.onclick = (e)=>{ e.preventDefault(); document.getElementById(id).scrollIntoView({behavior:'smooth'}) }
    li.style.marginLeft = ((parseInt(h.tagName.substr(1))-1)*10)+'px'
    li.appendChild(a)
    ul.appendChild(li)
  })
  tocContainer.appendChild(ul)
}

// startup
loadAllFromLocal(); if(Object.keys(pages).length===0){ pages['환영합니다'] = '= 환영합니다 =\n\n담비위키에 오신 것을 환영합니다.' }
try{ if(!Array.isArray(users)) users = [] }catch(e){ users = [] }
if(localStorage.getItem('dambi_wiki_user')){ user=JSON.parse(localStorage.getItem('dambi_wiki_user')) }
renderAuth(); renderPageList();

// route: parse path /<title>/<lang>
(function(){ const parts = window.location.pathname.split('/').filter(Boolean); if(parts.length>=2){ const lang = parts.pop(); const title = decodeURIComponent(parts.pop()); currentLang = lang || 'ko'; appLoadPage(title,currentLang); langSelect.value = currentLang } else if(parts.length===1){ const title = decodeURIComponent(parts[0]); appLoadPage(title,currentLang) } else { appLoadPage(currentPage,currentLang) }})();

// expose some APIs to window for inline onclicks used in generated HTML
window.appLoadPage = appLoadPage
window.restorePage = restorePage
window.permanentlyDeletePage = permanentlyDeletePage
window.adminDeleteUser = adminDeleteUser
window.restoreVersion = restoreVersion
window.logout = logout

// expose saveAll for debugging
window.saveAllToLocal = saveAllToLocal

