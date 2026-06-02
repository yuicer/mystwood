const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

const SPACE_STATUS = {
  ACTIVE: 'active'
}

const SYNC_EVENT_TYPES = {
  TASK_CREATED: 'TASK_CREATED',
  TASK_COMPLETED: 'TASK_COMPLETED'
}

function getUniqueOpenids(openids) {
  return Array.from(new Set((openids || []).filter(openid => typeof openid === 'string' && openid)))
}

function createInitialSync(now) {
  return {
    version: 0,
    updatedAt: now,
    changes: []
  }
}

function createTaskId() {
  return `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
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

function toClientTask(task) {
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

exports.main = async (event) => {
  const wxContext = cloud.getWXContext()
  const { action, payload = {}, id } = event
  try {
    switch (action) {
      case 'createTask': {
        const title = payload && typeof payload.title === 'string' ? payload.title.trim() : ''
        if (!title) return { code: 400, message: '请填写任务标题' }

        const spaceRes = await db.collection('spaces').where({ members: wxContext.OPENID }).limit(1).get()
        const space = spaceRes.data[0]
        if (!space) return { code: 404, message: '请先创建空间' }
        if (space.status !== SPACE_STATUS.ACTIVE) return { code: 400, message: '双方加入后才能创建任务' }

        const row = {
          _id: createTaskId(),
          creator: wxContext.OPENID,
          title,
          locationName: payload.locationName || '',
          imageUrl: payload.imageUrl || '',
          deadline: payload.deadline || null,
          status: 'todo',
          createdAt: Date.now()
        }
        const task = row
        const targetOpenids = (space.members || []).filter(openid => openid !== wxContext.OPENID)
        const change = createSyncChange(space, {
          type: SYNC_EVENT_TYPES.TASK_CREATED,
          actor: wxContext.OPENID,
          targetOpenids,
          entityType: 'task',
          entityId: task._id,
          payload: {
            title,
            deadline: task.deadline,
            status: task.status
          }
        })
        const sync = appendSyncChange(space, change)
        const tasks = [...(space.tasks || []), task]

        await db.collection('spaces').doc(space._id).update({ data: { tasks, sync } })
        return { code: 0, data: toClientTask(task) }
      }
      case 'completeTask': {
        if (!id) return { code: 400, message: '任务不存在' }

        const spaceRes = await db.collection('spaces').where({ members: wxContext.OPENID }).limit(1).get()
        const space = spaceRes.data[0]
        if (!space) return { code: 404, message: '请先创建空间' }

        const tasks = space.tasks || []
        const taskIndex = tasks.findIndex(task => task && task._id === id)
        if (taskIndex < 0) return { code: 404, message: '任务不存在' }

        const task = tasks[taskIndex]
        if (task.status === 'completed') return { code: 0, data: true }

        const completedAt = Date.now()
        const updatedTask = { ...task, status: 'completed', completedAt }
        const updatedTasks = tasks.map((row, index) => index === taskIndex ? updatedTask : row)
        const change = createSyncChange(space, {
          type: SYNC_EVENT_TYPES.TASK_COMPLETED,
          actor: wxContext.OPENID,
          targetOpenids: space.members || [],
          entityType: 'task',
          entityId: id,
          payload: {
            status: 'completed',
            completedAt
          }
        })
        const sync = appendSyncChange(space, change)

        await db.collection('spaces').doc(space._id).update({ data: { tasks: updatedTasks, sync } })
        return { code: 0, data: true }
      }
      default:
        return { code: 400, message: `unknown action: ${action}` }
    }
  } catch (error) {
    return { code: 500, message: error.message }
  }
}
