const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

const SPACE_STATUS = {
  PENDING: 'pending',
  ACTIVE: 'active'
}

const THEME_PRESETS = [
  {
    maxScore: 39,
    name: '静谧浅滩',
    bg: 'linear-gradient(135deg,#f7f6f3,#e9eef0,#dfe8df)'
  },
  {
    maxScore: 79,
    name: '日光暖湾',
    bg: 'linear-gradient(135deg,#f7f6f3,#eadfc9,#d8e3dc)'
  },
  {
    maxScore: Infinity,
    name: '晴空海岸',
    bg: 'linear-gradient(135deg,#eef5f8,#d8e9ed,#cfe2d4)'
  }
]

function getSpaceTheme(score) {
  const currentScore = typeof score === 'number' ? score : 50
  return THEME_PRESETS.find(theme => currentScore <= theme.maxScore) || THEME_PRESETS[THEME_PRESETS.length - 1]
}

function withSpaceTheme(space) {
  if (!space) return null
  const score = typeof space.score === 'number' ? space.score : 50
  return {
    ...space,
    score,
    theme: getSpaceTheme(score)
  }
}

function getInviteToken(event) {
  const rawToken = event.inviteToken || event.token
  return typeof rawToken === 'string' ? rawToken.trim() : ''
}

function formatInviteState(payload) {
  if (!payload) return null
  return {
    spaceId: payload._id,
    name: payload.name,
    inviteToken: payload.inviteToken,
    status: payload.status
  }
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const { action, name } = event
  const inviteToken = getInviteToken(event)

  try {
    switch (action) {
      case 'getState': {
        const spaceRes = await db.collection('spaces').where({ members: wxContext.OPENID }).limit(1).get()
        const space = withSpaceTheme(spaceRes.data[0] || null)
        if (!space) return { code: 0, data: { space: null, tasks: [], memories: [] } }

        const tasksRes = await db.collection('tasks').where({ spaceId: space._id }).get()
        const tasks = tasksRes.data || []
        const memories = tasks.filter(t => t.status === 'completed' || t.status === 'overdue')

        return { code: 0, data: { space, tasks, memories } }
      }
      case 'createSpace': {
        const score = 50
        const doc = {
          name: name || '我们的小宇宙',
          status: SPACE_STATUS.PENDING,
          members: [wxContext.OPENID],
          inviteToken: Math.random().toString(36).slice(2, 10),
          score,
          theme: getSpaceTheme(score),
          createdAt: Date.now()
        }
        const created = await db.collection('spaces').add({ data: doc })
        return { code: 0, data: { _id: created._id, ...doc } }
      }
      case 'getInvite': {
        if (!inviteToken) return { code: 400, message: '邀请码无效' }

        const inviteRes = await db.collection('spaces').where({ inviteToken, status: SPACE_STATUS.PENDING }).limit(1).get()
        const row = inviteRes.data[0]
        if (!row) return { code: 404, message: '邀请不存在或已失效' }

        return {
          code: 0,
          data: {
            name: row.name,
            inviteToken: row.inviteToken
          }
        }
      }
      case 'getInviteState': {
        if (!inviteToken) return { code: 400, message: '邀请码无效' }

        const inviteRes = await db.collection('spaces').where({ inviteToken }).limit(1).get()
        const row = inviteRes.data[0]
        if (!row) return { code: 404, message: '邀请不存在或已失效' }

        return {
          code: 0,
          data: formatInviteState(row)
        }
      }
      case 'acceptInvite': {
        if (!inviteToken) return { code: 400, message: '邀请码无效' }

        const currentSpaceRes = await db.collection('spaces').where({ members: wxContext.OPENID }).limit(1).get()
        if (currentSpaceRes.data[0]) return { code: 400, message: '你已加入一个空间' }

        const pending = await db.collection('spaces').where({ inviteToken, status: SPACE_STATUS.PENDING }).limit(1).get()
        const row = pending.data[0]
        if (!row) return { code: 404, message: '邀请不存在或已失效' }

        if ((row.members || []).includes(wxContext.OPENID)) {
          return { code: 400, message: '不能接受自己的邀请' }
        }

        const members = Array.from(new Set([...(row.members || []), wxContext.OPENID]))
        await db.collection('spaces').doc(row._id).update({ data: { status: SPACE_STATUS.ACTIVE, members } })
        return { code: 0, data: true }
      }
      case 'dissolveSpace': {
        const spaceRes = await db.collection('spaces').where({ members: wxContext.OPENID }).limit(1).get()
        const space = spaceRes.data[0]
        if (!space) return { code: 0, data: true }
        await db.collection('spaces').doc(space._id).remove()
        return { code: 0, data: true }
      }
      default:
        return { code: 400, message: `unknown action: ${action}` }
    }
  } catch (error) {
    return { code: 500, message: error.message }
  }
}
