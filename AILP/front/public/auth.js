const SUPABASE_URL = 'https://mgawpujvandftyslmnxf.supabase.co'
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_2DsoZRHEzJl14DFSCxHslQ_4gjQvigo'

const authGate = document.getElementById('authGate')
const appRoot = document.getElementById('appRoot')
const authMessage = document.getElementById('authMessage')
const authStatus = document.getElementById('authStatus')
const googleLoginButton = document.getElementById('googleLoginButton')
const logoutButton = document.getElementById('logoutButton')

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})

let appLoaded = false

function setStatus(message, isError = false) {
  authStatus.textContent = message ?? ''
  authStatus.classList.toggle('error', isError)
}

async function hasAppAccess(userId) {
  const { data, error } = await supabaseClient
    .from('user_roles')
    .select('role, client_id')
    .eq('user_id', userId)
    .limit(1)

  if (error) {
    throw error
  }

  return Array.isArray(data) && data.length > 0
}

async function loadApp(user) {
  if (!appLoaded) {
    await new Promise((resolve, reject) => {
      const script = document.createElement('script')
      script.src = './public/app.js'
      script.onload = resolve
      script.onerror = reject
      document.body.appendChild(script)
    })
    appLoaded = true
  }

  const sideBottom = document.querySelector('.side-bottom strong')
  const sideBottomSub = document.querySelector('.side-bottom small')
  const avatar = document.querySelector('.avatar')

  if (sideBottom) {
    sideBottom.textContent = user.user_metadata?.full_name || user.email || 'AILP User'
  }

  if (sideBottomSub) {
    sideBottomSub.textContent = user.email || ''
  }

  if (avatar) {
    avatar.textContent = (user.email || 'A').slice(0, 1).toUpperCase()
  }
}

async function showAuthorizedApp(user) {
  authGate.hidden = true
  appRoot.hidden = false
  logoutButton.hidden = false
  googleLoginButton.hidden = true
  await loadApp(user)
}

async function showUnauthorizedState() {
  appRoot.hidden = true
  authGate.hidden = false
  googleLoginButton.hidden = true
  logoutButton.hidden = false
  authMessage.textContent = 'このアカウントには AILP の閲覧権限がありません。管理者に `user_roles` の付与を依頼してください。'
  setStatus('権限未付与のため、管理画面は表示していません。', true)
}

async function signOut() {
  await supabaseClient.auth.signOut()
  appRoot.hidden = true
  authGate.hidden = false
  googleLoginButton.hidden = false
  logoutButton.hidden = true
  authMessage.textContent = 'Googleログイン後、権限が付与されているユーザーだけ管理画面を表示します。'
  setStatus('ログアウトしました。')
}

async function refreshSession() {
  setStatus('ログイン状態を確認しています。')

  const { data, error } = await supabaseClient.auth.getSession()

  if (error) {
    setStatus('ログイン状態の確認に失敗しました。', true)
    return
  }

  const session = data.session

  if (!session?.user) {
    authGate.hidden = false
    appRoot.hidden = true
    googleLoginButton.hidden = false
    logoutButton.hidden = true
    setStatus('')
    return
  }

  try {
    const allowed = await hasAppAccess(session.user.id)

    if (!allowed) {
      await showUnauthorizedState()
      return
    }

    setStatus('')
    await showAuthorizedApp(session.user)
  } catch (sessionError) {
    console.error(sessionError)
    setStatus('権限確認に失敗しました。しばらくしてから再試行してください。', true)
  }
}

googleLoginButton?.addEventListener('click', async () => {
  setStatus('Googleログインへ移動します。')

  const { error } = await supabaseClient.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.origin + window.location.pathname,
    },
  })

  if (error) {
    setStatus('Googleログインの開始に失敗しました。', true)
  }
})

logoutButton?.addEventListener('click', async () => {
  await signOut()
})

supabaseClient.auth.onAuthStateChange(() => {
  queueMicrotask(() => {
    refreshSession()
  })
})

refreshSession()
