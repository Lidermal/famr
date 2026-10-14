// Configure apenas URL e chave anon/public do Supabase. Nunca publique service_role ou senhas mestras no frontend.
const FAMR_CONFIG = { supabaseUrl: "", supabaseAnonKey: "", logoPath: "famrlogo.png" };

const demoUsers = [
  { id: 'd1', nickname: 'Chefia de Polícia', email: 'chefia@famr.local', rank: 'Chefia de Polícia', role: 'master', status: 'active', groups: ['Comando'] },
  { id: 'd2', nickname: 'Major Aurora', email: 'aurora@famr.local', rank: 'Major', role: 'member', status: 'active', groups: ['CRH'] },
  { id: 'd3', nickname: 'Capitão Nox', email: 'nox@famr.local', rank: 'Capitão', role: 'member', status: 'active', groups: ['Setor Principal'] }
];

const demoGroups = [
  { name: 'Comando', color: '#c7ab4e', description: 'Direção e comando', visible: true },
  { name: 'CRH', color: '#4d8b5a', description: 'Centro de Recursos Humanos', visible: true },
  { name: 'Setor Principal', color: '#6d85a5', description: 'Atividades gerais', visible: true },
  { name: 'Inteligência', color: '#8773a5', description: 'Grupo restrito', visible: false }
];

const topics = [
  { title: 'Setor Principal', description: 'Orientações, atividades e comunicados.', icon: '⌂', group: '' },
  { title: 'Listagem', description: 'Consulta de militares e registros.', icon: '▤', group: '' },
  { title: 'Requerimentos', description: 'Envie solicitações para análise do CRH.', icon: '✉', group: '' },
  { title: 'Documentos principais', description: 'Regulamentos, códigos e documentos oficiais.', icon: '▧', group: '' },
  { title: 'Companhias', description: 'Companhias e suas atribuições.', icon: '⚑', group: '' },
  { title: 'Área do CRH', description: 'Conteúdo reservado aos integrantes.', icon: '♙', group: 'CRH' }
];

let supabase = null;
let backend = false;
let currentUser = null;
let adminTab = 'pending';
let requests = [];

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
}[char]));

function toast(message) {
  const toastEl = $('#toast');
  toastEl.textContent = message;
  toastEl.classList.add('show');
  setTimeout(() => toastEl.classList.remove('show'), 2800);
}

function notice(message, bad = false) {
  const loginNotice = $('#loginNotice');
  loginNotice.textContent = message;
  loginNotice.style.color = bad ? '#a83d38' : '#477349';
}

function isAdmin() {
  return ['admin', 'master'].includes(currentUser?.role);
}

function userGroups() {
  return currentUser?.groups || [];
}

function logAction(action, details = {}) {
  if (backend && currentUser) {
    supabase.from('audit_logs').insert({
      actor_id: currentUser.id,
      action,
      details,
      source: 'web'
    }).then(() => {});
  }
}

function setIdentity(user) {
  currentUser = user;
  const name = user.nickname || user.user_metadata?.nickname || user.email || 'Militar';

  $('#sideName').textContent = $('#topName').textContent = name;
  $('#sideRole').textContent = user.role === 'master' ? 'Chefia de Polícia' : user.role === 'admin' ? 'Administrador' : 'Militar';
  $('#sideAvatar').textContent = $('#topAvatar').textContent = name[0].toUpperCase();
  $('#adminNav').classList.toggle('hidden', !isAdmin());
}

function enter(user) {
  setIdentity(user);
  $('#loginScreen').classList.add('hidden');
  $('#appShell').classList.remove('hidden');
  renderPage('home');
}

async function loadProfile(user) {
  const { data, error } = await supabase.from('profiles').select('id,nickname,rank,role,status').eq('id', user.id).maybeSingle();

  if (error) {
    console.error(error);
    return user;
  }

  if (!data || data.status !== 'active') {
    await supabase.auth.signOut();
    notice('Cadastro pendente ou conta desativada. Procure um administrador.');
    return null;
  }

  return { ...user, ...data, email: user.email };
}

async function init() {
  if (FAMR_CONFIG.supabaseUrl && FAMR_CONFIG.supabaseAnonKey && window.supabase) {
    supabase = window.supabase.createClient(FAMR_CONFIG.supabaseUrl, FAMR_CONFIG.supabaseAnonKey);
    backend = true;
    $('#connectionText').textContent = 'Conectado ao Supabase';

    supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        const user = await loadProfile(session.user);
        if (user) enter(user);
      }
    });

    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      const user = await loadProfile(session.user);
      if (user) enter(user);
    }
  }

  $('#year').textContent = new Date().getFullYear();
}

$('#loginForm').onsubmit = async (event) => {
  event.preventDefault();

  const nickname = $('#loginNickname').value.trim();
  const password = $('#loginPassword').value;

  if (backend) {
    const { data, error } = await supabase.functions.invoke('famr-auth', { body: { action: 'login', nickname, password } });

    if (error || !data?.session) {
      notice('Nickname ou senha inválidos, ou conta ainda não ativada.', true);
      return;
    }

    const { error: sessionError } = await supabase.auth.setSession(data.session);
    if (sessionError) {
      notice('Não foi possível iniciar a sessão.', true);
      return;
    }

    const user = await loadProfile(data.session.user);
    if (user) {
      logAction('login');
      enter(user);
    }
    return;
  }

  const user = demoUsers.find((item) => item.nickname.toLowerCase() === nickname.toLowerCase());
  if (!user) {
    notice('Demonstração: tente Chefia de Polícia, Major Aurora ou Capitão Nox.', true);
    return;
  }

  logAction('login');
  enter(user);
};

function modal(title, subtitle, html) {
  $('#modalTitle').textContent = title;
  $('#modalEyebrow').textContent = subtitle;
  $('#modalBody').innerHTML = html;
  $('#modal').showModal();

  $('#modalBody').querySelectorAll('[data-close]').forEach((button) => {
    button.onclick = () => $('#modal').close();
  });

  $('#registerForm')?.addEventListener('submit', register);
  $('#resetForm')?.addEventListener('submit', resetPassword);
  $('#requestForm')?.addEventListener('submit', submitRequest);
  $('#groupForm')?.addEventListener('submit', saveGroup);
  $('#topicForm')?.addEventListener('submit', saveTopic);
  $('#editProfileForm')?.addEventListener('submit', saveProfile);
  $('#docForm')?.addEventListener('submit', saveDocument);
}

$('#closeModal').onclick = () => $('#modal').close();

$('#registerButton').onclick = () => modal(
  'Solicitar cadastro',
  'Após o cadastro, um administrador precisa ativar sua conta.',
  `<form id="registerForm"><label class="field-label">Nickname Habbo</label><input class="field-input" name="nickname" required maxlength="40" pattern="[A-Za-z0-9._-]+"><label class="field-label">E-mail para recuperação</label><input class="field-input" name="email" type="email" required><label class="field-label">Senha (mínimo 8 caracteres)</label><input class="field-input" name="password" type="password" minlength="8" required><div class="modal-form-actions"><button type="button" class="btn secondary" data-close>Cancelar</button><button class="btn primary">Cadastrar</button></div></form>`
);

$('#forgotButton').onclick = () => modal(
  'Redefinir senha',
  'Informe seu nickname. O link será enviado ao e-mail cadastrado.',
  `<form id="resetForm"><label class="field-label">Nickname Habbo</label><input class="field-input" name="nickname" required><div class="modal-form-actions"><button type="button" class="btn secondary" data-close>Cancelar</button><button class="btn primary">Enviar link</button></div></form>`
);

async function register(event) {
  event.preventDefault();

  if (!backend) {
    $('#modal').close();
    notice('Configure o Supabase para registrar contas.');
    return;
  }

  const form = new FormData(event.currentTarget);
  const nickname = form.get('nickname').trim();

  const { data, error } = await supabase.auth.signUp({
    email: form.get('email'),
    password: form.get('password'),
    options: { data: { nickname } }
  });

  if (error) {
    toast(error.message);
    return;
  }

  if (data.user) {
    logAction('signup', { nickname });
    $('#modal').close();
    notice('Cadastro enviado. Procure um administrador para ativar sua conta.');
  }
}

async function resetPassword(event) {
  event.preventDefault();

  if (!backend) {
    toast('Configure o Supabase para ativar o envio de redefinição.');
    return;
  }

  const nickname = new FormData(event.currentTarget).get('nickname').trim();
  const { error } = await supabase.functions.invoke('famr-auth', {
    body: { action: 'reset', nickname, redirectTo: location.origin + location.pathname }
  });

  if (error) {
    toast('Não foi possível enviar o link.');
    return;
  }

  $('#modal').close();
  notice('Se o e-mail estiver cadastrado, você receberá o link de redefinição.');
}

function renderPage(page) {
  const titles = {
    home: 'Início',
    directory: 'Listagem',
    requests: 'Requerimentos',
    documents: 'Documentos',
    companies: 'Companhias',
    profile: 'Meu perfil',
    groups: 'Grupos',
    admin: 'Painel administrativo'
  };

  $('#pageCrumb').textContent = titles[page] || 'Início';
  $$('[data-page]').forEach((button) => button.classList.toggle('active', button.dataset.page === page));

  let html = '';

  if (page === 'home') html = homeHtml();
  if (page === 'directory') html = directoryHtml();
  if (page === 'requests') html = requestsHtml();
  if (page === 'documents') html = documentsHtml();
  if (page === 'companies') html = companiesHtml();
  if (page === 'profile') html = profileHtml();
  if (page === 'groups') html = groupsHtml();
  if (page === 'admin' && isAdmin()) html = adminHtml();

  $('#pageContent').innerHTML = html || '<div class="panel empty">Você não tem acesso a esta área.</div>';
  bindPage(page);
}

function homeHtml() {
  const visible = topics.filter((item) => !item.group || userGroups().includes(item.group));

  return `<section class="welcome"><div><div class="eyebrow">PORTAL INSTITUCIONAL · FAMR</div><h1>HONRA E SERVIÇO, ${esc((currentUser.nickname || currentUser.user_metadata?.nickname || 'MILITAR').toUpperCase())}</h1><p>Informação, organização e serviço em um só lugar.</p><div class="welcome-actions"><button class="btn" data-go="directory">Ver listagem</button><button class="btn alt" data-go="requests">Novo requerimento</button></div></div><img class="welcome-mark" src="famrlogo.png" alt="Emblema FAMR" onerror="this.style.display='none'"></section><div class="stats"><div class="stat-card"><div class="stat-icon">♙</div><div><small>Militares ativos</small><b id="activeCount">—</b></div></div><div class="stat-card"><div class="stat-icon">✉</div><div><small>Meus requerimentos</small><b>${requests.filter((item) => item.user_id === currentUser.id).length}</b></div></div><div class="stat-card"><div class="stat-icon">⚑</div><div><small>Companhias</small><b>4</b></div></div><div class="stat-card"><div class="stat-icon">▧</div><div><small>Documentos</small><b>—</b></div></div></div><div class="section-head"><div><h2 class="section-title">Áreas do sistema</h2><p>Acesse os setores disponíveis para o seu perfil.</p></div></div><div class="topic-grid">${visible.map((topic) => `<article class="topic-card" data-go="${topic.title === 'Requerimentos' ? 'requests' : topic.title === 'Documentos principais' ? 'documents' : topic.title === 'Companhias' ? 'companies' : 'directory'}"><div class="topic-top"><div class="topic-icon">${topic.icon}</div><span class="tag">${topic.group ? 'RESTRITO' : 'FAMR'}</span></div><h3>${esc(topic.title)}</h3><p>${esc(topic.description)}</p><div class="topic-meta">Acesso autorizado <span>→</span></div></article>`).join('')}</div><div class="section-head"><h2 class="section-title">Acesso rápido</h2></div><div class="activity-layout"><section class="panel"><h3 class="panel-title">Atividade recente</h3><div class="activity-row"><div class="activity-icon">✦</div><div><b>Bem-vindo ao Portal FAMR</b><small>Sistema de gestão interna da corporação</small></div><time>Agora</time></div><div class="activity-row"><div class="activity-icon">▧</div><div><b>Documentos e normas</b><small>Consulte documentos institucionais</small></div></div></section><section class="panel"><h3 class="panel-title">Atalhos</h3><div class="quick-list"><button class="quick-btn" data-go="requests">Criar requerimento <span>→</span></button><button class="quick-btn" data-go="directory">Buscar militar <span>→</span></button><button class="quick-btn" data-go="groups">Ver meus grupos <span>→</span></button></div></section></div>`;
}

function directoryHtml() {
  return `<div class="page-head"><div><h1 class="page-title">Listagem militar</h1><p>Consulte os militares ativos na FAMR.</p></div><button class="btn primary" id="exportCsv">Exportar CSV</button></div><div class="panel"><div class="filter-row"><input id="directorySearch" placeholder="Buscar nickname ou patente..."></div><div id="directoryTable"></div></div>`;
}

function requestsHtml() {
  return `<div class="page-head"><div><h1 class="page-title">Requerimentos</h1><p>Envie pedidos e acompanhe a análise do CRH.</p></div><button class="btn primary" id="newRequest">+ Novo requerimento</button></div><div class="filter-row"><select id="requestFilter"><option value="">Todos os status</option><option value="pending">Pendente</option><option value="approved">Aprovado</option><option value="rejected">Recusado</option></select></div><div id="requestList"></div>`;
}

function documentsHtml() {
  return `<div class="page-head"><div><h1 class="page-title">Documentos oficiais</h1><p>Normas e materiais de referência da corporação.</p></div>${isAdmin() ? '<button class="btn primary" id="newDocument">+ Adicionar</button>' : ''}</div><div id="documentList"></div>`;
}

function companiesHtml() {
  return `<div class="page-head"><div><h1 class="page-title">Companhias</h1><p>Estrutura organizacional da FAMR.</p></div></div><div class="group-grid">${[['1º Batalhão', 'Formação e instrução', '#547449'], ['Companhia de Operações', 'Operações institucionais', '#536a8b'], ['CRH', 'Recursos humanos e carreira', '#92734b'], ['Inteligência', 'Análise e segurança interna', '#75628d']].map((group) => `<div class="group-card"><span class="group-color" style="background:${group[2]}"></span><span class="tag">COMPANHIA</span><h3>${group[0]}</h3><p>${group[1]}</p></div>`).join('')}</div>`;
}

function profileHtml() {
  const user = currentUser;
  return `<div class="page-head"><div><h1 class="page-title">Meu perfil</h1><p>Informações da sua conta militar.</p></div><button class="btn secondary" id="editProfile">Editar perfil</button></div><div class="profile-grid"><section class="panel profile-card"><div class="profile-avatar">${esc((user.nickname || 'M')[0].toUpperCase())}</div><h2>${esc(user.nickname || 'Militar')}</h2><p>${esc(user.rank || 'Militar')} · ${esc(user.role)}</p><span class="tag">CONTA ATIVA</span></section><section class="panel"><h3 class="panel-title">Dados cadastrais</h3><div class="profile-details"><div class="detail"><small>Nickname</small><b>${esc(user.nickname || '—')}</b></div><div class="detail"><small>E-mail</small><b>${esc(user.email || '—')}</b></div><div class="detail"><small>Patente</small><b>${esc(user.rank || 'A definir')}</b></div><div class="detail"><small>Grupos</small><b>${esc(userGroups().join(', ') || 'Sem grupos')}</b></div></div></section></div>`;
}

function groupsHtml() {
  return `<div class="page-head"><div><h1 class="page-title">Grupos e setores</h1><p>Grupos visíveis e acessíveis à sua conta.</p></div></div><div class="group-grid">${demoGroups.filter((group) => group.visible || isAdmin() || userGroups().includes(group.name)).map((group) => `<div class="group-card"><span class="group-color" style="background:${group.color}"></span><span class="tag">${group.visible ? 'VISÍVEL' : 'RESTRITO'}</span><h3>${esc(group.name)}</h3><p>${esc(group.description)}</p></div>`).join('')}</div>`;
}

function adminHtml() {
  return `<div class="page-head"><div><h1 class="page-title">Painel administrativo</h1><p>Gestão de acessos, grupos, conteúdo e auditoria.</p></div><span class="tag">${currentUser.role === 'master' ? 'CONTA MESTRA' : 'ADMINISTRADOR'}</span></div><div class="admin-cards"><div class="admin-metric"><small>Militares ativos</small><b id="adminActive">—</b></div><div class="admin-metric"><small>Cadastros pendentes</small><b id="pendingCount">—</b></div><div class="admin-metric"><small>Ações registradas</small><b id="logCount">—</b></div></div><div class="admin-tabs"><button class="admin-tab active" data-tab="pending">Aprovações</button><button class="admin-tab" data-tab="groups">Grupos</button><button class="admin-tab" data-tab="topics">Tópicos</button><button class="admin-tab" data-tab="logs">Logs de ações</button><button class="admin-tab" data-tab="logins">Logs de login</button></div><div class="panel" id="adminPanel"></div>`;
}

async function directoryRows() {
  if (backend) {
    const { data, error } = await supabase.from('profiles').select('id,nickname,rank,status').eq('status', 'active').order('nickname').limit(500);
    if (error) {
      toast('Falha ao carregar militares.');
      return [];
    }
    return data || [];
  }

  return demoUsers;
}

async function refreshDirectory() {
  let rows = await directoryRows();
  const query = ($('#directorySearch')?.value || '').toLowerCase();
  rows = rows.filter((user) => (user.nickname + ' ' + (user.rank || '')).toLowerCase().includes(query));

  if ($('#directoryTable')) {
    $('#directoryTable').innerHTML = rows.length ? `<table class="data-table"><thead><tr><th>Militar</th><th>Patente</th><th>Status</th></tr></thead><tbody>${rows.map((user) => `<tr><td><b>${esc(user.nickname)}</b></td><td>${esc(user.rank || 'Militar')}</td><td><span class="rank">Ativo</span></td></tr>`).join('')}</tbody></table>` : '<div class="empty">Nenhum militar encontrado.</div>';
  }

  if ($('#activeCount')) $('#activeCount').textContent = rows.length;
  if ($('#adminActive')) $('#adminActive').textContent = rows.length;
}

async function refreshRequests() {
  let rows = backend
    ? await (async () => {
        const { data, error } = await supabase.from('requests').select('id,title,body,status,created_at,user_id,profiles(nickname)').order('created_at', { ascending: false }).limit(100);
        if (error) return [];
        return data || [];
      })()
    : requests.filter((request) => request.user_id === currentUser.id || isAdmin());

  const filter = $('#requestFilter')?.value;
  rows = rows.filter((request) => !filter || request.status === filter);

  if (!$('#requestList')) return;

  $('#requestList').innerHTML = rows.length
    ? rows.map((request) => `<article class="request-card"><div class="topic-top"><div><h3>${esc(request.title)}</h3><small>${esc(request.profiles?.nickname || currentUser.nickname)} · ${new Date(request.created_at || Date.now()).toLocaleDateString('pt-BR')}</small></div><span class="rank">${request.status === 'pending' ? 'Pendente' : request.status === 'approved' ? 'Aprovado' : 'Recusado'}</span></div><p>${esc(request.body)}</p>${isAdmin() && request.status === 'pending' ? `<div class="request-actions"><button class="btn primary" data-approve="${request.id}">Aprovar</button><button class="btn danger" data-reject="${request.id}">Recusar</button></div>` : ''}</article>`).join('')
    : '<div class="panel empty">Não há requerimentos para exibir.</div>';

  $$('[data-approve]').forEach((button) => button.onclick = () => setRequestStatus(button.dataset.approve, 'approved'));
  $$('[data-reject]').forEach((button) => button.onclick = () => setRequestStatus(button.dataset.reject, 'rejected'));
}

async function setRequestStatus(id, status) {
  if (backend) {
    const { error } = await supabase.from('requests').update({ status, reviewed_by: currentUser.id }).eq('id', id);
    if (error) {
      toast(error.message);
      return;
    }
  } else {
    const request = requests.find((item) => item.id === id);
    if (request) request.status = status;
  }

  logAction('request_' + status, { id });
  toast('Requerimento atualizado.');
  refreshRequests();
}

async function loadDocuments() {
  if (backend) {
    const { data, error } = await supabase.from('documents').select('id,title,description,url,category').order('title').limit(100);
    if (!error) return data || [];
  }

  return [
    { title: 'Código Disciplinar', description: 'Normas de conduta e disciplina militar.', category: 'Regulamento' },
    { title: 'Regimento Interno', description: 'Organização e funcionamento da FAMR.', category: 'Institucional' },
    { title: 'Manual de Recrutamento', description: 'Procedimentos de formação.', category: 'Manual' }
  ];
}

async function refreshDocs() {
  const documents = await loadDocuments();

  if ($('#documentList')) {
    $('#documentList').innerHTML = documents.map((document) => `<article class="document-row"><div class="topic-icon">▧</div><div><b>${esc(document.title)}</b><small>${esc(document.category || 'Documento')} · ${esc(document.description || '')}</small></div>${document.url ? `<a class="btn secondary" href="${esc(document.url)}" target="_blank" rel="noopener">Abrir</a>` : ''}</article>`).join('') || '<div class="panel empty">Nenhum documento cadastrado.</div>';
  }
}

function bindPage(page) {
  $$('[data-go]').forEach((button) => {
    button.onclick = () => renderPage(button.dataset.go);
  });

  if (page === 'directory') {
    refreshDirectory();
    $('#directorySearch').oninput = refreshDirectory;
    $('#exportCsv').onclick = exportCsv;
  }

  if (page === 'requests') {
    refreshRequests();
    $('#newRequest').onclick = () => modal(
      'Novo requerimento',
      'Encaminhe para análise do CRH.',
      `<form id="requestForm"><label class="field-label">Tipo</label><select class="field-select" name="kind"><option>Criação de tag</option><option>Alteração cadastral</option><option>Promoção</option><option>Transferência</option><option>Outro</option></select><label class="field-label">Título</label><input class="field-input" name="title" required maxlength="100"><label class="field-label">Detalhes</label><textarea class="field-area" name="body" rows="4" required maxlength="3000"></textarea><div class="modal-form-actions"><button type="button" class="btn secondary" data-close>Cancelar</button><button class="btn primary">Enviar</button></div></form>`
    );
    $('#requestFilter').onchange = refreshRequests;
  }

  if (page === 'documents') {
    refreshDocs();
    $('#newDocument')?.addEventListener('click', () => modal(
      'Adicionar documento',
      'Cadastro institucional',
      `<form id="docForm"><label class="field-label">Título</label><input class="field-input" name="title" required><label class="field-label">Descrição</label><textarea class="field-area" name="description"></textarea><label class="field-label">Link</label><input class="field-input" name="url" type="url"><div class="modal-form-actions"><button type="button" class="btn secondary" data-close>Cancelar</button><button class="btn primary">Salvar</button></div></form>`
    ));
  }

  if (page === 'profile') {
    $('#editProfile').onclick = () => modal(
      'Editar perfil',
      'Atualize seus dados',
      `<form id="editProfileForm"><label class="field-label">Nickname</label><input class="field-input" name="nickname" required value="${esc(currentUser.nickname || '')}"><div class="modal-form-actions"><button type="button" class="btn secondary" data-close>Cancelar</button><button class="btn primary">Salvar</button></div></form>`
    );
  }

  if (page === 'admin') bindAdmin();
}

async function submitRequest(event) {
  event.preventDefault();

  const form = new FormData(event.currentTarget);
  const item = {
    user_id: currentUser.id,
    title: form.get('kind') + ': ' + form.get('title'),
    body: form.get('body'),
    status: 'pending'
  };

  if (backend) {
    const { error } = await supabase.from('requests').insert(item);
    if (error) {
      toast(error.message);
      return;
    }
  } else {
    requests.unshift({ ...item, id: crypto.randomUUID(), created_at: new Date().toISOString() });
  }

  logAction('request_created', { title: item.title });
  $('#modal').close();
  toast('Requerimento enviado.');
  refreshRequests();
}

async function saveProfile(event) {
  event.preventDefault();
  const nickname = new FormData(event.currentTarget).get('nickname').trim();

  if (backend) {
    const { error } = await supabase.from('profiles').update({ nickname }).eq('id', currentUser.id);
    if (error) {
      toast(error.message);
      return;
    }
  }

  currentUser.nickname = nickname;
  setIdentity(currentUser);
  logAction('profile_updated');
  $('#modal').close();
  renderPage('profile');
  toast('Perfil atualizado.');
}

async function saveDocument(event) {
  event.preventDefault();

  const form = new FormData(event.currentTarget);
  const document = {
    title: form.get('title'),
    description: form.get('description'),
    url: form.get('url'),
    category: 'Documento'
  };

  if (backend) {
    const { error } = await supabase.from('documents').insert(document);
    if (error) {
      toast(error.message);
      return;
    }
  }

  logAction('document_created', { title: document.title });
  $('#modal').close();
  refreshDocs();
}

function bindAdmin() {
  refreshDirectory();
  loadAdmin();

  $$('[data-tab]').forEach((button) => {
    button.onclick = () => {
      adminTab = button.dataset.tab;
      $$('[data-tab]').forEach((tab) => tab.classList.toggle('active', tab === button));
      loadAdmin();
    };
  });
}

async function loadAdmin() {
  const panel = $('#adminPanel');
  if (!panel) return;

  if (adminTab === 'pending') {
    if (!backend) {
      panel.innerHTML = '<div class="empty">Cadastros pendentes serão exibidos após configurar o Supabase.</div>';
      $('#pendingCount').textContent = '0';
      return;
    }

    const { data, error } = await supabase.from('profiles').select('id,nickname,created_at').eq('status', 'pending').order('created_at').limit(100);

    if (error) {
      panel.innerHTML = '<div class="empty">Sem acesso aos cadastros.</div>';
      return;
    }

    $('#pendingCount').textContent = data.length;
    panel.innerHTML = data.length
      ? `<table class="data-table"><thead><tr><th>Nickname</th><th>Solicitado</th><th>Ação</th></tr></thead><tbody>${data.map((user) => `<tr><td>${esc(user.nickname)}</td><td>${new Date(user.created_at).toLocaleDateString('pt-BR')}</td><td><button class="btn primary" data-activate="${user.id}">Ativar</button> <button class="btn danger" data-ban="${user.id}">Recusar</button></td></tr>`).join('')}</tbody></table>`
      : '<div class="empty">Nenhum cadastro pendente.</div>';

    $$('[data-activate]').forEach((button) => button.onclick = () => setUserStatus(button.dataset.activate, 'active'));
    $$('[data-ban]').forEach((button) => button.onclick = () => setUserStatus(button.dataset.ban, 'banned'));
    return;
  }

  if (adminTab === 'groups') {
    panel.innerHTML = `<div class="section-head"><h3 class="panel-title">Grupos e hierarquia</h3><button class="btn primary" id="addGroup">+ Criar grupo</button></div><div class="group-grid">${demoGroups.map((group) => `<div class="group-card"><span class="group-color" style="background:${group.color}"></span><span class="tag">${group.visible ? 'VISÍVEL' : 'INVISÍVEL'}</span><h3>${esc(group.name)}</h3><p>${esc(group.description)}</p></div>`).join('')}</div>`;

    $('#addGroup').onclick = () => modal(
      'Criar grupo',
      'Novo grupo institucional',
      `<form id="groupForm"><label class="field-label">Nome</label><input class="field-input" name="name" required><label class="field-label">Descrição</label><input class="field-input" name="description"><label class="field-label">Cor</label><input class="field-input" type="color" name="color" value="#53734c"><label class="field-label"><input name="visible" type="checkbox" checked> Grupo visível</label><div class="modal-form-actions"><button type="button" class="btn secondary" data-close>Cancelar</button><button class="btn primary">Criar</button></div></form>`
    );
    return;
  }

  if (adminTab === 'topics') {
    panel.innerHTML = `<div class="section-head"><h3 class="panel-title">Tópicos da página inicial</h3><button class="btn primary" id="addTopic">+ Criar tópico</button></div>${topics.map((topic) => `<div class="activity-row"><div class="activity-icon">${topic.icon}</div><div><b>${esc(topic.title)}</b><small>${topic.group ? 'Acesso: ' + esc(topic.group) : 'Militares ativos'}</small></div></div>`).join('')}`;

    $('#addTopic').onclick = () => modal(
      'Criar tópico',
      'Defina o acesso',
      `<form id="topicForm"><label class="field-label">Nome</label><input class="field-input" name="title" required><label class="field-label">Descrição</label><textarea class="field-area" name="description"></textarea><label class="field-label">Grupo obrigatório</label><select class="field-select" name="group"><option value="">Todos os militares</option>${demoGroups.map((group) => `<option>${esc(group.name)}</option>`).join('')}</select><div class="modal-form-actions"><button type="button" class="btn secondary" data-close>Cancelar</button><button class="btn primary">Criar</button></div></form>`
    );
    return;
  }

  if (adminTab === 'logs' || adminTab === 'logins') {
    if (!backend) {
      panel.innerHTML = '<div class="empty">Configure Supabase para armazenar e consultar logs.</div>';
      $('#logCount').textContent = '0';
      return;
    }

    let query = supabase.from('audit_logs').select('action,created_at,actor_id,details').order('created_at', { ascending: false }).limit(100);
    if (adminTab === 'logins') query = query.eq('action', 'login');

    const { data, error } = await query;

    if (error) {
      panel.innerHTML = '<div class="empty">Sem permissão para consultar logs.</div>';
      return;
    }

    $('#logCount').textContent = data.length;
    panel.innerHTML = `<table class="data-table"><thead><tr><th>Ação</th><th>Ator</th><th>Detalhes</th><th>Data</th></tr></thead><tbody>${data.map((log) => `<tr><td>${esc(log.action)}</td><td>${esc(log.actor_id)}</td><td>${esc(JSON.stringify(log.details || {}))}</td><td>${new Date(log.created_at).toLocaleString('pt-BR')}</td></tr>`).join('')}</tbody></table>`;
  }
}

async function setUserStatus(id, status) {
  const { error } = await supabase.from('profiles').update({ status }).eq('id', id);
  if (error) {
    toast(error.message);
    return;
  }

  logAction('user_status_changed', { id, status });
  toast('Status atualizado.');
  loadAdmin();
}

async function saveGroup(event) {
  event.preventDefault();

  const form = new FormData(event.currentTarget);
  const group = {
    name: form.get('name'),
    description: form.get('description'),
    color: form.get('color'),
    visible: form.has('visible')
  };

  if (backend) {
    const { error } = await supabase.from('groups').insert(group);
    if (error) {
      toast(error.message);
      return;
    }
  }

  demoGroups.push(group);
  logAction('group_created', { name: group.name });
  $('#modal').close();
  loadAdmin();
}

async function saveTopic(event) {
  event.preventDefault();

  const form = new FormData(event.currentTarget);
  const topic = {
    title: form.get('title'),
    description: form.get('description'),
    icon: '▣',
    group: form.get('group')
  };

  if (backend) {
    const { error } = await supabase.from('topics').insert({
      title: topic.title,
      description: topic.description,
      required_group: topic.group || null
    });

    if (error) {
      toast(error.message);
      return;
    }
  }

  topics.push(topic);
  logAction('topic_created', { title: topic.title });
  $('#modal').close();
  loadAdmin();
}

function exportCsv() {
  directoryRows().then((rows) => {
    const csv = [
      ['Nickname', 'Patente', 'Status'],
      ...rows.map((row) => [row.nickname, row.rank || '', row.status || ''])
    ].map((row) => row.map((value) => '"' + String(value).replaceAll('"', '""') + '"').join(',')).join('\r\n');

    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv' }));
    link.download = 'famr-listagem.csv';
    link.click();
    URL.revokeObjectURL(link.href);

    logAction('directory_exported', { count: rows.length });
  });
}

$$('[data-page]').forEach((button) => {
  button.onclick = () => {
    renderPage(button.dataset.page);
    $('#sidebar').classList.remove('open');
  };
});

$$('[data-go]').forEach((button) => {
  button.onclick = () => renderPage(button.dataset.go);
});

$('#menuButton').onclick = () => $('#sidebar').classList.toggle('open');
$('#profileShortcut').onclick = () => renderPage('profile');
$('#logoutButton').onclick = async () => {
  logAction('logout');
  if (backend) await supabase.auth.signOut();
  $('#appShell').classList.add('hidden');
  $('#loginScreen').classList.remove('hidden');
};

$('#globalSearch').onkeydown = (event) => {
  if (event.key === 'Enter' && event.target.value.trim()) {
    renderPage('directory');
    setTimeout(() => {
      $('#directorySearch').value = event.target.value;
      refreshDirectory();
    }, 0);
  }
};

window.addEventListener('hashchange', async () => {
  if (location.hash.includes('access_token') && backend) {
    const { data: { session } } = await supabase.auth.getSession();

    if (session) {
      modal(
        'Nova senha',
        'Crie uma senha nova',
        `<form id="newPasswordForm"><label class="field-label">Nova senha</label><input class="field-input" name="password" type="password" minlength="8" required><div class="modal-form-actions"><button class="btn primary">Salvar senha</button></div></form>`
      );

      $('#newPasswordForm')?.addEventListener('submit', async (event) => {
        event.preventDefault();
        const { error } = await supabase.auth.updateUser({
          password: new FormData(event.currentTarget).get('password')
        });

        if (error) {
          toast(error.message);
          return;
        }

        await supabase.auth.signOut();
        $('#modal').close();
        toast('Senha alterada. Entre novamente.');
      });
    }
  }
});

init();
