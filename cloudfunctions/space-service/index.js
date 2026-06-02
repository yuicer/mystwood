const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

const SPACE_STATUS = {
  PENDING: 'pending',
  ACTIVE: 'active',
  DISSOLVED: 'dissolved'
}

const SYNC_EVENT_TYPES = {
  INVITE_CONFIRMED: 'INVITE_CONFIRMED',
  SPACE_DISSOLVED: 'SPACE_DISSOLVED'
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

function getUniqueOpenids(openids) {
  return Array.from(new Set((openids || []).filter(openid => typeof openid === 'string' && openid)))
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function clampNumber(value, fallback, min, max) {
  const numberValue = Number(value)
  if (!Number.isFinite(numberValue)) return fallback
  return Math.max(min, Math.min(max, numberValue))
}

function createInitialSync(now) {
  return {
    version: 0,
    updatedAt: now,
    changes: []
  }
}

function createSyncChange(space, { type, actor, targetOpenids, entityType, entityId, payload }) {
  const targets = getUniqueOpenids(targetOpenids).filter(openid => openid !== actor)
  if (!space || !type || !actor || targets.length === 0) return null

  const now = Date.now()
  const sync = space.sync || createInitialSync(now)
  return {
    v: Number(sync.version || 0) + 1,
    type,
    targets,
    entity: entityType || '',
    entityId: entityId || '',
    payload: payload || {},
    at: now
  }
}

function appendSyncChange(space, change) {
  const now = Date.now()
  const currentSync = space.sync || createInitialSync(now)
  if (!change) return currentSync

  return {
    version: change.v,
    updatedAt: change.at,
    changes: [...(currentSync.changes || []), change].slice(-50)
  }
}

function toClientSpace(space) {
  if (!space || space.status === SPACE_STATUS.DISSOLVED) return null
  const themedSpace = withSpaceTheme(space)
  return {
    _id: themedSpace._id,
    name: themedSpace.name,
    status: themedSpace.status,
    inviteToken: themedSpace.inviteToken,
    theme: themedSpace.theme,
    createdAt: themedSpace.createdAt
  }
}

function toClientTask(task) {
  if (!task) return null
  return {
    _id: task._id,
    title: task.title,
    locationName: task.locationName || '',
    imageUrl: task.imageUrl || '',
    deadline: task.deadline || null,
    status: task.status,
    createdAt: task.createdAt,
    completedAt: task.completedAt || null
  }
}

function toClientChange(change) {
  if (!change) return null
  return {
    v: change.v,
    type: change.type,
    entity: change.entity,
    entityId: change.entityId,
    at: change.at,
    payload: change.payload || {}
  }
}

async function getCurrentSpace(openid, options = {}) {
  const spaceRes = await db.collection('spaces').where({ members: openid }).limit(1).get()
  const space = spaceRes.data[0] || null
  if (!space) return null
  if (!options.includeDissolved && space.status === SPACE_STATUS.DISSOLVED) return null
  return space
}

async function querySyncChanges({ openid, spaceId, cursor, limit }) {
  const spaceRes = await db.collection('spaces').doc(spaceId).get()
  const space = spaceRes.data
  const changes = space && space.sync && Array.isArray(space.sync.changes) ? space.sync.changes : []
  const latestVersion = Number((space && space.sync && space.sync.version) || cursor)

  return {
    events: changes
      .filter(change => Number(change.v || 0) > cursor && (change.targets || []).includes(openid))
      .slice(0, limit)
      .map(toClientChange)
      .filter(Boolean),
    latestVersion
  }
}

function getNextCursor(cursor, changes) {
  return (changes || []).reduce((nextCursor, change) => {
    return Math.max(nextCursor, Number(change.v || 0))
  }, cursor)
}

async function waitSyncEvents(openid, event) {
  const space = await getCurrentSpace(openid)
  if (!space) return { code: 404, message: '请先创建空间' }

  const startedAt = Date.now()
  let cursor = clampNumber(event.cursor, Number((space.sync && space.sync.version) || 0), 0, Number.MAX_SAFE_INTEGER)
  const timeoutMs = clampNumber(event.timeoutMs, 15000, 3000, 25000)
  const intervalMs = clampNumber(event.intervalMs, 4000, 1000, 8000)
  const limit = clampNumber(event.limit, 20, 1, 50)

  while (Date.now() - startedAt < timeoutMs) {
    const result = await querySyncChanges({
      openid,
      spaceId: space._id,
      cursor,
      limit
    })
    const events = result.events || []

    if (events.length > 0) {
      cursor = getNextCursor(cursor, events)
      return {
        code: 0,
        data: {
          events,
          cursor,
          serverTime: Date.now()
        }
      }
    }

    cursor = Math.max(cursor, Number(result.latestVersion || cursor))
    await sleep(intervalMs)
  }

  return {
    code: 0,
    data: {
      events: [],
      cursor,
      serverTime: Date.now()
    }
  }
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const { action, name } = event
  const inviteToken = getInviteToken(event)

  try {
    switch (action) {
      case 'getState': {
        const rawSpace = await getCurrentSpace(wxContext.OPENID)
        if (!rawSpace) return { code: 0, data: { space: null, tasks: [], memories: [], syncCursor: 0 } }

        const tasks = (rawSpace.tasks || []).map(toClientTask).filter(Boolean)
        const memories = tasks.filter(t => t.status === 'completed' || t.status === 'overdue')
        const syncCursor = Number((rawSpace.sync && rawSpace.sync.version) || 0)

        return { code: 0, data: { space: toClientSpace(rawSpace), tasks, memories, syncCursor } }
      }
      case 'createSpace': {
        const currentSpace = await getCurrentSpace(wxContext.OPENID)
        if (currentSpace) return { code: 400, message: '你已加入一个空间' }

        const now = Date.now()
        const score = 50
        const doc = {
          name: name || '我们的小宇宙',
          status: SPACE_STATUS.PENDING,
          members: [wxContext.OPENID],
          inviteToken: Math.random().toString(36).slice(2, 10),
          score,
          theme: getSpaceTheme(score),
          tasks: [],
          sync: createInitialSync(now),
          createdAt: now
        }
        const created = await db.collection('spaces').add({ data: doc })
        return { code: 0, data: { ...toClientSpace({ _id: created._id, ...doc }), syncCursor: doc.sync.version } }
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
        const change = createSyncChange(row, {
          type: SYNC_EVENT_TYPES.INVITE_CONFIRMED,
          actor: wxContext.OPENID,
          targetOpenids: row.members || [],
          entityType: 'space',
          entityId: row._id,
          payload: {
            status: SPACE_STATUS.ACTIVE
          }
        })
        const sync = appendSyncChange(row, change)

        await db.collection('spaces').doc(row._id).update({ data: { status: SPACE_STATUS.ACTIVE, members, sync } })
        return { code: 0, data: true }
      }
      case 'dissolveSpace': {
        const spaceRes = await db.collection('spaces').where({ members: wxContext.OPENID }).limit(1).get()
        const space = spaceRes.data[0]
        if (!space) return { code: 0, data: true }
        const change = createSyncChange(space, {
          type: SYNC_EVENT_TYPES.SPACE_DISSOLVED,
          actor: wxContext.OPENID,
          targetOpenids: space.members || [],
          entityType: 'space',
          entityId: space._id,
          payload: {
            status: SPACE_STATUS.DISSOLVED
          }
        })
        const sync = appendSyncChange(space, change)

        await db.collection('spaces').doc(space._id).update({
          data: {
            status: SPACE_STATUS.DISSOLVED,
            members: [],
            inviteToken: '',
            tasks: [],
            sync,
            dissolvedAt: Date.now()
          }
        })
        return { code: 0, data: true }
      }
      case 'waitSyncEvents': {
        return waitSyncEvents(wxContext.OPENID, event)
      }
      default:
        return { code: 400, message: `unknown action: ${action}` }
    }
  } catch (error) {
    return { code: 500, message: error.message }
  }
}
