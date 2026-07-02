// src/app.js
// Main application script extracted from index.html for easier documentation and CI.

const DOMPurify = window.DOMPurify

// --- data structures ---
let pages = {"환영합니다": "= 환영합니다 =\n\n담비위키에 오신 것을 환영합니다.\n\n== 사용법 ==\n* 왼쪽에서 문서를 선택하거나 새 문서를 만드세요.\n* 문서를 편집하고 저장하세요.\n\n== 다국어 지원 ==\n언어 선택 메뉴에서 한국어, 영어, 일본어, 중국어를 선택할 수 있습니다.\n\n== 미디어 문법 ==\n* 이미지: [파일:파일명.png]\n* 오디오: [오디오:파일명.mp3]\n* 동영상: [비디오:파일명.mp4]"}
let pagesMeta = {}
let pagesTranslations = {} // pagesTranslations[title] = { lang: content }
let trash = {}
let pagesHistory = {}
let deletionLog = []
let users = []
let files = {} // files[filename] = { dataUrl, type, size, uploadedBy, uploadedAt }
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
  const lines = text.split('\n')
  let i=0
  while(i<lines.length){
    const line = lines[i]
    const m = line.match(/^\[\^(.+?)\]:\s*(.*)$/)
    if(m){
      const id = m[1]
      let content = m[2] || ''
      i++
      while(i<lines.length && lines[i].trim() !== ''){
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
  text = text.replace(/\[\[(.+?)\]\]/g,function(_,p){ return '<a href="/'+encodeURIComponent(p)+'/'+currentLang+'" onclick="event.preventDefault();window.appLoadPage(\''+p.replace(/'/g,"\\'")+"'); return false">'+p+'</a>' })

  // external links
  text = text.replace(/\[(https?:\/\/.+?)\s+(.+?)\]/g,'<a href="$1" target="_blank" rel="noopener">$2</a>')

  // images from file registry or external URL
  text = text.replace(/\[파일:(.+?)\]/g, (_, name) => {
    if(files[name]) return `<span data-media-type="image" data-media-key="${escapeHtml(name)}" style="display:inline-block"></span>`
    return `<img src="${escapeHtml(name)}" style="max-width:100%;border-radius:6px">`
  })

  // audio
  text = text.replace(/\[오디오:(.+?)\]/g, (_, name) => {
    return `<span data-media-type="audio" data-media-key="${escapeHtml(name)}" style="display:block;margin:8px 0"></span>`
  })

  // video
  text = text.replace(/\[비디오:(.+?)\]/g, (_, name) => {
    return `<span data-media-type="video" data-media-key="${escapeHtml(name)}" style="display:block;margin:8px 0"></span>`
  })

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
  let html = DOMPurify.sanitize(text, {
    ALLOWED_TAGS:['h1','h2','h3','h4','h5','h6','strong','em','a','img','br','ul','li','ol','pre','code','blockquote','hr','table','tr','td','th','sup','div','section','span'],
    ADD_ATTR:['data-media-type','data-media-key','style','controls']
  })

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
  // files stored separately (each key may be large)
  const fileMeta = {}
  Object.keys(files).forEach(name => {
    const {dataUrl, ...meta} = files[name]
    fileMeta[name] = meta
    localStorage.setItem('dambi_file_data_'+name, dataUrl)
  })
  localStorage.setItem('dambi_wiki_files_meta', JSON.stringify(fileMeta))
}

export function loadAllFromLocal(){
  try{ if(localStorage.getItem('dambi_wiki_pages')) pages = JSON.parse(localStorage.getItem('dambi_wiki_pages')) }catch(e){}
  try{ if(localStorage.getItem('dambi_wiki_meta')) pagesMeta = JSON.parse(localStorage.getItem('dambi_wiki_meta')) }catch(e){}
  try{ if(localStorage.getItem('dambi_wiki_translations')) pagesTranslations = JSON.parse(localStorage.getItem('dambi_wiki_translations')) }catch(e){}
  try{ if(localStorage.getItem('dambi_wiki_trash')) trash = JSON.parse(localStorage.getItem('dambi_wiki_trash')) }catch(e){}
  try{ if(localStorage.getItem('dambi_wiki_history')) pagesHistory = JSON.parse(localStorage.getItem('dambi_wiki_history')) }catch(e){}
  try{ if(localStorage.getItem('dambi_wiki_deletion_log')) deletionLog = JSON.parse(localStorage.getItem('dambi_wiki_deletion_log')) }catch(e){}
  try{ if(localStorage.getItem('dambi_wiki_users')) users = JSON.parse(localStorage.getItem('dambi_wiki_users')) }catch(e){}
  try{
    const fileMeta = JSON.parse(localStorage.getItem('dambi_wiki_files_meta')||'{}')
    files = {}
    Object.keys(fileMeta).forEach(name => {
      const dataUrl = localStorage.getItem('dambi_file_data_'+name) || ''
      files[name] = { ...fileMeta[name], dataUrl }
    })
  }catch(e){}
}

export function updateTrashButton(){ const cnt = Object.keys(trash).length; openTrashBtn.textContent = '휴지통 ('+cnt+')' }

export function renderMedia(container){
  container.querySelectorAll('[data-media-type]').forEach(el => {
    const type = el.dataset.mediaType
    const key = el.dataset.mediaKey
    const file = files[key]
    if(!file || !file.dataUrl){
      const err = document.createElement('span')
      err.style.cssText = 'color:#e11d48;font-size:0.85rem;background:#fef2f2;padding:2px 6px;border-radius:4px'
      err.textContent = '[파일 없음: '+key+']'
      el.replaceWith(err)
      return
    }
    if(type === 'image'){
      const img = document.createElement('img')
      img.src = file.dataUrl
      img.style.cssText = 'max-width:100%;border-radius:6px;display:block;margin:8px 0'
      img.alt = key
      el.replaceWith(img)
    } else if(type === 'audio'){
      const wrap = document.createElement('div')
      wrap.style.cssText = 'background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:10px 14px;margin:8px 0;display:flex;align-items:center;gap:10px'
      const label = document.createElement('span')
      label.style.cssText = 'font-size:0.85rem;color:#64748b;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap'
      label.textContent = '🎵 '+key
      const audio = document.createElement('audio')
      audio.controls = true
      audio.src = file.dataUrl
      audio.style.flex = '1'
      wrap.appendChild(label)
      wrap.appendChild(audio)
      el.replaceWith(wrap)
    } else if(type === 'video'){
      const wrap = document.createElement('div')
      wrap.style.cssText = 'margin:8px 0'
      const label = document.createElement('div')
      label.style.cssText = 'font-size:0.85rem;color:#64748b;margin-bottom:4px'
      label.textContent = '🎬 '+key
      const video = document.createElement('video')
      video.controls = true
      video.src = file.dataUrl
      video.style.cssText = 'max-width:100%;border-radius:8px;display:block'
      wrap.appendChild(label)
      wrap.appendChild(video)
      el.replaceWith(wrap)
    }
  })
}

export function renderPageList(){
  pageListEl.innerHTML=''
  Object.keys(pages).sort().forEach(title=>{
    const a=document.createElement('a')
    a.href='#'
    a.textContent=title
    a.className=(title===currentPage?'active':'')
    a.onclick=(e)=>{ e.preventDefault(); appLoadPage(title, currentLang) }
    pageListEl.appendChild(a)
  })
  updateTrashButton()
}

export function findBacklinks(title){
  const backlinks = []
  Object.keys(pages).forEach(t=>{
    if(t===title) return
    if((pages[t]||'').includes('[['+title+']]')) backlinks.push(t)
  })
  return backlinks
}

/**
 * Load page with optional language. If translation exists use it, else show original with banner.
 */
export function appLoadPage(title, lang='ko'){
  if(!pages[title]) return alert('문서를 찾을 수 없습니다.')
  currentPage = title
  currentLang = lang
  pageTitleEl.textContent = title
  // pick content: translation if available
  const transFor = pagesTranslations[title]||{}
  let content = transFor[lang] || pages[title]
  let html = namumarkToHTML(content)
  pageContentEl.innerHTML = html
  renderMedia(pageContentEl)
  renderTOC()
  renderPageList()
  loadComments(title)
  // show translation notice
  const notice = document.createElement('div')
  notice.style.fontSize='0.9rem'
  notice.style.color='#64748b'
  notice.style.marginTop='6px'
  if(lang !== 'ko' && !transFor[lang]){
    notice.innerHTML = '이 문서는 아직 '+lang+' 번역본이 없습니다. "번역하기"로 번역을 추가할 수 있습니다.'
    const btn = document.createElement('button')
    btn.textContent='번역하기'
    btn.className='btn'
    btn.style.marginLeft='8px'
    btn.onclick=()=>{ startTranslation(title, lang) }
    notice.appendChild(btn)
  }
  pageContentEl.prepend(notice)
  pageTitleEl.innerHTML = escapeHtml(title) + (pagesMeta[title] && pagesMeta[title].owner?('<span class="meta-badge">작성자: '+escapeHtml(pagesMeta[title].owner)+'</span>'):'')
  // update URL
  const path = '/'+encodeURIComponent(title)+'/'+lang
  history.replaceState({}, '', path)
  // update language selector
  langSelect.value = lang
}

export function onLangChange(lang){
  currentLang = lang
  appLoadPage(currentPage, lang)
}

export function startTranslation(title, lang){
  editArea.style.display='block'
  editBtn.style.display='none'
  saveBtn.style.display='inline-block'
  cancelBtn.style.display='inline-block'
  editTitle.value = title
  const trans = (pagesTranslations[title]||{})[lang]
  // if no translation, start from original or empty
  editContent.value = trans || pages[title]
  // mark edit start timestamp for conflict detection
  editStartUpdatedAt = pagesMeta[title] ? pagesMeta[title].updatedAt : null
}

export function editPage(){
  const meta = pagesMeta[currentPage] || {}
  if(meta.owner){
    if(!user || (user.email !== meta.owner && user.email !== adminEmail)){
      return alert('수정 권한이 없습니다.')
    }
  }
  editArea.style.display='block'
  editBtn.style.display='none'
  saveBtn.style.display='inline-block'
  cancelBtn.style.display='inline-block'
  editTitle.value=currentPage
  // if editing translation
  const transFor = pagesTranslations[currentPage]||{}
  editContent.value = transFor[currentLang] || pages[currentPage] || ''
  editStartUpdatedAt = pagesMeta[currentPage] ? pagesMeta[currentPage].updatedAt : null
  startAutosave()
}

export function cancelEdit(){
  editArea.style.display='none'
  editBtn.style.display='inline-block'
  saveBtn.style.display='none'
  cancelBtn.style.display='none'
  stopAutosave()
  autosaveStatus.textContent = '-'
}

/**
 * Save page or translation. If editing a translation, save under pagesTranslations. Performs conflict detection.
 */
export async function savePage(){
  const newTitle = editTitle.value.trim()
  const content = editContent.value
  if(!newTitle) return alert('제목을 입력하세요')
  
  // detect conflict
  const meta = pagesMeta[currentPage]
  if(meta && editStartUpdatedAt && meta.updatedAt && meta.updatedAt !== editStartUpdatedAt){
    const ok = confirm('문서가 다른 곳에서 변경되었습니다. 현재 편집 내용으로 덮어쓰시겠습니까? 취소하면 내용 비교 화면이 나옵니다.')
    if(!ok){
      alert('서버(로컬Storage) 버전과 편집 중인 버전을 비교하여 수동으로 병합하세요.')
      return
    }
  }

  // if title changed
  if(newTitle !== currentPage){
    if(pagesMeta[currentPage]) pagesMeta[newTitle] = pagesMeta[currentPage]
    delete pages[currentPage]
    delete pagesMeta[currentPage]
    if(pagesHistory[currentPage]){ pagesHistory[newTitle] = pagesHistory[currentPage]; delete pagesHistory[currentPage] }
  }

  // if saving translation (lang != default)
  if(currentLang && currentLang !== 'ko'){
    pagesTranslations[newTitle] = pagesTranslations[newTitle]||{}
    pagesTranslations[newTitle][currentLang] = content
  } else {
    // push history
    if(pages[currentPage]){
      pagesHistory[currentPage] = pagesHistory[currentPage]||[]
      pagesHistory[currentPage].push({content: pages[currentPage], author: (user&&user.email)||'익명', timestamp: Date.now()})
    }
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

export function openHistory(){
  const title = currentPage
  const history = pagesHistory[title]||[]
  pageTitleEl.textContent = '히스토리: '+title
  let html = '<div style="background:#fff;padding:12px;border-radius:8px">'
  if(history.length===0){
    html += '<p>변경 이력이 없습니다.</p>'
  } else {
    html += '<table><tr><th>버전</th><th>작성자</th><th>시간</th><th>액션</th></tr>'
    history.forEach((v,i)=>{
      const time = new Date(v.timestamp).toLocaleString('ko-KR')
      html += '<tr><td>#'+(i+1)+'</td><td>'+escapeHtml(v.author)+'</td><td>'+time+'</td><td><button class="btn" onclick="window.restoreVersion(\''+encodeURIComponent(title)+'\','+i+')">복원</button></td></tr>'
    })
    html += '</table>'
  }
  html += '<button class="btn" onclick="window.appLoadPage(\''+title.replace(/'/g,"\\'")+"','ko')\" style=\"margin-top:8px\">돌아가기</button></div>"
  pageContentEl.innerHTML = html
}

export function restoreVersion(encodedTitle, index){
  const title = decodeURIComponent(encodedTitle)
  const history = pagesHistory[title]||[]
  if(!history[index]) return alert('버전을 찾을 수 없습니다')
  pages[title] = history[index].content
  const now = Date.now()
  if(!pagesMeta[title]) pagesMeta[title] = { owner: (user&&user.email)||null, createdAt: now, updatedAt: now }
  else pagesMeta[title].updatedAt = now
  saveAllToLocal()
  appLoadPage(title, currentLang)
  showToast('복원되었습니다.')
}

export function newPage(){
  const title=prompt('새 문서 제목을 입력하세요:')
  if(title && !pages[title]){
    pages[title]='= '+title+' =\n\n내용을 입력하세요.'
    const now=Date.now()
    pagesMeta[title]={ owner: (user&&user.email)||null, createdAt: now, updatedAt: now }
    saveAllToLocal()
    renderPageList()
    appLoadPage(title, currentLang)
    showToast('새 문서를 만들었습니다.')
  }
}

export function searchPages(){
  const term=document.getElementById('globalSearch').value.toLowerCase()
  document.querySelectorAll('.page-list a').forEach(a=>{
    a.style.display=a.textContent.toLowerCase().includes(term)?'block':'none'
  })
}

export function loadComments(page){
  commentsList.innerHTML=''
  const all = JSON.parse(localStorage.getItem('dambi_wiki_comments')||'{}')
  const comments = all[page]||[]
  comments.forEach(c=>{
    const div=document.createElement('div')
    div.className='comment'
    const meta=document.createElement('div')
    meta.className='meta'
    meta.textContent=c.author+' - '+new Date(c.timestamp).toLocaleString('ko-KR')
    const text=document.createElement('p')
    text.textContent=c.text
    div.appendChild(meta)
    div.appendChild(text)
    commentsList.appendChild(div)
  })
}

export function postComment(){
  const text=commentInput.value.trim()
  if(!text) return alert('댓글 내용을 입력하세요')
  const all = JSON.parse(localStorage.getItem('dambi_wiki_comments')||'{}')
  all[currentPage]=all[currentPage]||[]
  all[currentPage].push({author:(user&&user.email)||'익명', text, timestamp: Date.now()})
  localStorage.setItem('dambi_wiki_comments', JSON.stringify(all))
  commentInput.value=''
  loadComments(currentPage)
  showToast('댓글이 등록되었습니다.')
}

export async function uploadFile(){
  const f = document.getElementById('fileInput').files[0]
  if(!f) return alert('파일을 선택하세요')
  const allowed = ['mp3','mp4','avi','png','jpeg','jpg']
  const ext = f.name.split('.').pop().toLowerCase()
  if(!allowed.includes(ext)) return alert('허용된 파일 형식: .mp3, .mp4, .avi, .png, .jpeg')
  if(f.size > 10 * 1024 * 1024) {
    if(!confirm('파일 크기가 10MB를 초과합니다 ('+Math.round(f.size/1024/1024)+'MB). 계속하시겠습니까?\n\n※ 브라우저 저장 용량을 많이 사용합니다.')) return
  }
  document.getElementById('uploadStatus').textContent='업로드 중...'
  const reader = new FileReader()
  reader.onload = e => {
    const dataUrl = e.target.result
    const name = f.name
    files[name] = { dataUrl, type: f.type, size: f.size, uploadedBy: (user&&user.email)||'익명', uploadedAt: Date.now() }
    // auto-create file document page
    const pageTitle = '파일:'+name
    const isAudio = ['mp3'].includes(ext)
    const isVideo = ['mp4','avi'].includes(ext)
    const isImage = ['png','jpeg','jpg'].includes(ext)
    let pageContent = '= '+pageTitle+' =\n\n'
    if(isAudio) pageContent += '[오디오:'+name+']\n\n'
    else if(isVideo) pageContent += '[비디오:'+name+']\n\n'
    else if(isImage) pageContent += '[파일:'+name+']\n\n'
    pageContent += '* 파일명: '+name+'\n* 크기: '+Math.round(f.size/1024)+'KB\n* 업로드: '+(user&&user.email||'익명')
    if(!pages[pageTitle]) {
      const now = Date.now()
      pages[pageTitle] = pageContent
      pagesMeta[pageTitle] = { owner: (user&&user.email)||null, createdAt: now, updatedAt: now }
    }
    // insert wiki syntax into editor
    if(isAudio) editContent.value += '[오디오:'+name+']'
    else if(isVideo) editContent.value += '[비디오:'+name+']'
    else if(isImage) editContent.value += '[파일:'+name+']'
    saveAllToLocal()
    renderPageList()
    document.getElementById('uploadStatus').textContent = '✅ 업로드 완료 — 파일 문서: '+pageTitle
    document.getElementById('fileInput').value = ''
    showToast('파일 "'+name+'" 업로드 완료')
  }
  reader.onerror = () => { document.getElementById('uploadStatus').textContent = '❌ 업로드 실패' }
  reader.readAsDataURL(f)
}

export function deletePage(){
  const title = currentPage
  const meta = pagesMeta[title] || {}
  if(meta.owner){
    if(!user || (user.email !== meta.owner && user.email !== adminEmail)){
      return alert('삭제 권한이 없습니다.')
    }
  }
  const backlinks = findBacklinks(title)
  if(backlinks.length>0){
    if(!confirm('다음 문서들이 "'+title+'"을(를) 링크하고 있습니다:\n- '+backlinks.join('\n- ')+'\n\n계속 삭제하시겠습니까?')){
      return
    }
  }
  const reason = prompt('삭제 이유를 입력하세요 (선택):') || ''
  const allComments = JSON.parse(localStorage.getItem('dambi_wiki_comments')||'{}')
  const commentsForPage = allComments[title]||[]
  trash[title] = { content: pages[title], meta: pagesMeta[title]||null, comments: commentsForPage, deletedBy: (user&&user.email)||'익명', deletedAt: Date.now(), reason: reason, backlinks: backlinks }
  delete pages[title]
  delete pagesMeta[title]
  if(allComments[title]){
    delete allComments[title]
    localStorage.setItem('dambi_wiki_comments', JSON.stringify(allComments))
  }
  deletionLog.push({title:title, deletedBy:(user&&user.email)||'익명', deletedAt: Date.now(), reason:reason, backlinks:backlinks})
  saveAllToLocal()
  const keys = Object.keys(pages)
  if(keys.length===0){
    pages['환영합니다'] = '= 환영합니다 =\n\n새 문서를 시작합니다.'
    pagesMeta['환영합니다'] = { owner: null, createdAt: Date.now(), updatedAt: Date.now() }
  }
  renderPageList()
  appLoadPage(Object.keys(pages)[0], currentLang)
  showToast('문서를 휴지통으로 이동했습니다.')
}

export function openTrash(){
  pageTitleEl.textContent = '휴지통'
  let html = '<div style="background:#fff;padding:12px;border-radius:8px">'
  const keys = Object.keys(trash)
  if(keys.length===0){
    html += '<p>휴지통이 비어있습니다.</p>'
  } else {
    html += '<table><tr><th>제목</th><th>삭제자</th><th>삭제 이유</th><th>액션</th></tr>'
    keys.forEach(title=>{
      const item=trash[title]
      html += '<tr><td>'+escapeHtml(title)+'</td><td>'+escapeHtml(item.deletedBy)+'</td><td>'+escapeHtml(item.reason)+'</td><td><button class="btn" onclick="window.restorePage(\''+encodeURIComponent(title)+'\')">복원</button> <button class="btn danger" onclick="window.permanentlyDeletePage(\''+encodeURIComponent(title)+'\')">완전 삭제</button></td></tr>'
    })
    html += '</table>'
  }
  html += '<button class="btn" onclick="window.appLoadPage(\'환영합니다\',\'ko\')" style="margin-top:8px">돌아가기</button></div>'
  pageContentEl.innerHTML = html
  renderPageList()
}

export function restorePage(encodedTitle){
  const title = decodeURIComponent(encodedTitle)
  if(!trash[title]) return alert('항목을 찾을 수 없습니다')
  pages[title] = trash[title].content
  pagesMeta[title] = trash[title].meta||{owner: null, createdAt: Date.now(), updatedAt: Date.now()}
  // restore comments
  const all = JSON.parse(localStorage.getItem('dambi_wiki_comments')||'{}')
  all[title] = trash[title].comments
  localStorage.setItem('dambi_wiki_comments', JSON.stringify(all))
  delete trash[title]
  updateTrashButton()
  saveAllToLocal()
  renderPageList()
  appLoadPage(title, currentLang)
  showToast('복원되었습니다.')
}

export function permanentlyDeletePage(encodedTitle){
  const title = decodeURIComponent(encodedTitle)
  if(!trash[title]) return alert('항목을 찾을 수 없습니다')
  if(!confirm('"'+title+'"을(를) 완전히 삭제하시겠습니까?')) return
  delete trash[title]
  updateTrashButton()
  saveAllToLocal()
  showToast('영구 삭제되었습니다.')
}

export function openAdmin(){
  if(!user || user.email !== adminEmail) return alert('관리자 전용 기능입니다.')
  pageTitleEl.textContent = '관리자 콘솔'
  let html = '<div style="background:#fff;padding:16px;border-radius:8px;max-width:900px">'

  // === Users ===
  html += '<h3 style="margin-top:0;border-bottom:2px solid #e2e8f0;padding-bottom:6px">👤 사용자 관리</h3>'
  if(users.length===0){
    html += '<p style="color:#64748b">등록된 사용자가 없습니다.</p>'
  } else {
    html += '<table><tr><th>이메일</th><th>관리자</th><th>액션</th></tr>'
    users.forEach(u=>{
      const isAdmin = u.email === adminEmail
      html += '<tr>'
        +'<td>'+escapeHtml(u.email)+'</td>'
        +'<td>'+(isAdmin?'<span style="color:#0ea5a4;font-weight:600">✔ 관리자</span>':'')+'</td>'
        +'<td>'+(isAdmin?'<span style="color:#94a3b8;font-size:0.85rem">삭제 불가</span>':'<button class="btn danger" onclick="window.adminDeleteUser(\''+encodeURIComponent(u.email)+'\')">삭제</button>')+'</td>'
        +'</tr>'
    })
    html += '</table>'
  }

  // === Pages ===
  html += '<h3 style="margin-top:20px;border-bottom:2px solid #e2e8f0;padding-bottom:6px">📄 문서 관리 ('+Object.keys(pages).length+'개)</h3>'
  const pageKeys = Object.keys(pages).sort()
  if(pageKeys.length===0){
    html += '<p style="color:#64748b">문서가 없습니다.</p>'
  } else {
    html += '<div style="max-height:260px;overflow:auto;border:1px solid #e2e8f0;border-radius:6px">'
    html += '<table style="margin:0"><tr><th>제목</th><th>작성자</th><th>수정일</th><th>액션</th></tr>'
    pageKeys.forEach(title=>{
      const meta = pagesMeta[title]||{}
      const updatedAt = meta.updatedAt ? new Date(meta.updatedAt).toLocaleDateString('ko-KR') : '-'
      html += '<tr>'
        +'<td><a href="#" onclick="event.preventDefault();window.appLoadPage(\''+encodeURIComponent(title)+'\',\'ko\')">'+escapeHtml(title)+'</a></td>'
        +'<td>'+escapeHtml(meta.owner||'익명')+'</td>'
        +'<td>'+updatedAt+'</td>'
        +'<td><button class="btn danger" onclick="window.adminDeletePage(\''+encodeURIComponent(title)+'\')">삭제</button></td>'
        +'</tr>'
    })
    html += '</table></div>'
  }

  // === Files ===
  html += '<h3 style="margin-top:20px;border-bottom:2px solid #e2e8f0;padding-bottom:6px">📁 파일 관리 ('+Object.keys(files).length+'개)</h3>'
  const fileKeys = Object.keys(files).sort()
  if(fileKeys.length===0){
    html += '<p style="color:#64748b">업로드된 파일이 없습니다.</p>'
  } else {
    html += '<div style="max-height:260px;overflow:auto;border:1px solid #e2e8f0;border-radius:6px">'
    html += '<table style="margin:0"><tr><th>파일명</th><th>종류</th><th>크기</th><th>업로드</th><th>액션</th></tr>'
    fileKeys.forEach(name=>{
      const f = files[name]
      const ext = name.split('.').pop().toLowerCase()
      const icon = ['mp3'].includes(ext)?'🎵':(['mp4','avi'].includes(ext)?'🎬':'🖼')
      html += '<tr>'
        +'<td>'+icon+' '+escapeHtml(name)+'</td>'
        +'<td>'+escapeHtml(f.type||ext)+'</td>'
        +'<td>'+Math.round((f.size||0)/1024)+'KB</td>'
        +'<td>'+escapeHtml(f.uploadedBy||'-')+'</td>'
        +'<td>'
          +'<button class="btn" onclick="window.appLoadPage(\''+encodeURIComponent('파일:'+name)+'\',\'ko\')" style="margin-right:4px">보기</button>'
          +'<button class="btn danger" onclick="window.adminDeleteFile(\''+encodeURIComponent(name)+'\')">삭제</button>'
        +'</td>'
        +'</tr>'
    })
    html += '</table></div>'
  }

  html += '<div style="margin-top:16px">'
    +'<button class="btn" onclick="window.appLoadPage(\'환영합니다\',\'ko\')">돌아가기</button>'
  html += '</div></div>'
  pageContentEl.innerHTML = html
}

export function adminDeletePage(encodedTitle){
  const title = decodeURIComponent(encodedTitle)
  if(!confirm('"'+title+'" 문서를 완전히 삭제하시겠습니까?')) return
  delete pages[title]
  delete pagesMeta[title]
  delete pagesHistory[title]
  saveAllToLocal()
  showToast('"'+title+'" 문서 삭제됨')
  openAdmin()
}

export function adminDeleteFile(encodedName){
  const name = decodeURIComponent(encodedName)
  if(!confirm('"'+name+'" 파일을 삭제하시겠습니까?\n\n파일 문서(파일:'+name+')도 함께 삭제됩니다.')) return
  delete files[name]
  localStorage.removeItem('dambi_file_data_'+name)
  const pageTitle = '파일:'+name
  if(pages[pageTitle]){ delete pages[pageTitle]; delete pagesMeta[pageTitle] }
  saveAllToLocal()
  renderPageList()
  showToast('"'+name+'" 파일 삭제됨')
  openAdmin()
}

export function adminDeleteUser(encodedEmail){
  const email = decodeURIComponent(encodedEmail)
  if(!confirm(email+' 사용자를 삭제하시겠습니까?')) return
  users = users.filter(u=>u.email !== email)
  saveAllToLocal()
  openAdmin()
  showToast('사용자가 삭제되었습니다.')
}

// Auth handlers
function setupAuthHandlers(){
  if(loginBtn) loginBtn.addEventListener('click', ()=>{
    const email=prompt('이메일:')
    const pw=prompt('비밀번호:')
    if(!email||!pw) return
    const found = users.find(u=>u.email===email)
    if(!found){ return alert('사용자를 찾을 수 없습니다.') }
    if(found.password !== pw){ return alert('비밀번호가 일치하지 않습니다.') }
    user=found
    localStorage.setItem('dambi_wiki_user', JSON.stringify(user))
    renderAuth()
    showToast('로그인되었습니다.')
  })
  
  if(signupBtn) signupBtn.addEventListener('click', ()=>{
    const email=prompt('회원가입 이메일:')
    const pw=prompt('비밀번호:')
    if(!email||!pw) return
    if(!users.find(u=>u.email===email)) users.push({email, password: pw})
    saveAllToLocal()
    showToast('회원가입되었습니다. 로그인해주세요.')
  })
}

export function renderAuth(){
  const stored = localStorage.getItem('dambi_wiki_user')
  adminEmail = localStorage.getItem('dambi_wiki_admin') || null
  if(stored){
    user=JSON.parse(stored)
    let badge = '<span style="color:#fff; font-size:0.9rem">'+escapeHtml(user.email)+' 로그인됨</span>'
    let logoutBtn = '<button style="background:transparent;border:1px solid rgba(255,255,255,0.12);color:#fff;padding:6px 10px;border-radius:6px;cursor:pointer;margin-left:8px;" onclick="window.logout()">로그아웃</button>'
    authArea.innerHTML = badge + logoutBtn
    if(user.email===adminEmail){
      const btn = document.createElement('button')
      btn.textContent='관리자'
      btn.className='admin-btn'
      btn.style.marginLeft='8px'
      btn.onclick = openAdmin
      authArea.appendChild(btn)
    }
  }else{
    authArea.innerHTML = '<button id="loginBtn">로그인</button><button id="signupBtn">회원가입</button>'
    setupAuthHandlers()
  }
}

export function logout(){
  localStorage.removeItem('dambi_wiki_user')
  user=null
  renderAuth()
  showToast('로그아웃되었습니다.')
}

// Autosave
function autosaveKey(title, lang){
  return 'dambi_autosave_'+encodeURIComponent(title)+'_'+lang
}
function startAutosave(){
  stopAutosave()
  autosaveTimer = setInterval(()=>{
    const key = autosaveKey(editTitle.value||currentPage, currentLang||'ko')
    localStorage.setItem(key, editContent.value)
    autosaveStatus.textContent = new Date().toLocaleTimeString()
  }, 5000)
}
function stopAutosave(){
  if(autosaveTimer) clearInterval(autosaveTimer)
  autosaveTimer=null
}

// TOC generation
export function renderTOC(){
  tocContainer.innerHTML = ''
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

// URL 라우팅 처리
export function routeFromUrl(){
  const pathname = window.location.pathname
  // /로 시작하는 경로만 처리
  if(!pathname || pathname === '/' || pathname === '') {
    appLoadPage(currentPage, 'ko')
    return
  }
  
  const parts = pathname.split('/').filter(Boolean)
  
  // 경로 형식: /문서제목/언어코드
  if(parts.length >= 2){
    const lang = parts[parts.length - 1]
    const titleEncoded = parts[parts.length - 2]
    const title = decodeURIComponent(titleEncoded)
    
    // 유효한 언어 코드 확인
    const validLangs = ['ko', 'en', 'ja', 'zh']
    if(validLangs.includes(lang) && pages[title]){
      currentLang = lang
      appLoadPage(title, lang)
      return
    }
  }
  
  // 경로 형식: /문서제목 (기본 언어는 ko)
  if(parts.length >= 1){
    const titleEncoded = parts[parts.length - 1]
    const title = decodeURIComponent(titleEncoded)
    if(pages[title]){
      appLoadPage(title, 'ko')
      return
    }
  }
  
  // 경로를 찾을 수 없으면 기본 페이지 로드
  appLoadPage(currentPage, 'ko')
}

// 뒤로가기/앞으로가기 처리
window.addEventListener('popstate', ()=>{
  routeFromUrl()
})

// startup
loadAllFromLocal()
if(Object.keys(pages).length===0){
  pages['환영합니다'] = '= 환영합니다 =\n\n담비위키에 오신 것을 환영합니다.'
}
try{ if(!Array.isArray(users)) users = [] }catch(e){ users = [] }
if(localStorage.getItem('dambi_wiki_user')){
  user=JSON.parse(localStorage.getItem('dambi_wiki_user'))
}
renderAuth()
renderPageList()
setupAuthHandlers()

// 초기 페이지 로드 - URL 경로 기반으로 결정
routeFromUrl()

// expose all functions used by inline onclick handlers and generated HTML
window.appLoadPage = appLoadPage
window.restorePage = restorePage
window.permanentlyDeletePage = permanentlyDeletePage
window.adminDeleteUser = adminDeleteUser
window.adminDeletePage = adminDeletePage
window.adminDeleteFile = adminDeleteFile
window.restoreVersion = restoreVersion
window.logout = logout
window.routeFromUrl = routeFromUrl
window.saveAllToLocal = saveAllToLocal
window.searchPages = searchPages
window.newPage = newPage
window.openTrash = openTrash
window.onLangChange = onLangChange
window.editPage = editPage
window.openHistory = openHistory
window.savePage = savePage
window.cancelEdit = cancelEdit
window.deletePage = deletePage
window.postComment = postComment
window.uploadFile = uploadFile
window.openAdmin = openAdmin
