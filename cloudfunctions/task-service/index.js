const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

const SPACE_STATUS = {
  ACTIVE: 'active'
}

const SYNC_EVENT_TYPES = {
  TASK_CREATED: 'TASK_CREATED',
  TASK_UPDATED: 'TASK_UPDATED',
  TASK_IMAGES_ADDED: 'TASK_IMAGES_ADDED',
  TASK_COMPLETED: 'TASK_COMPLETED',
  TASK_DELETED: 'TASK_DELETED'
}

const LOCATION_SOURCES = ['wx-choose-location', 'qqmap-poi', 'qqmap-center']
const MAX_TASK_IMAGE_COUNT = 9

function getUniqueOpenids(openids) {
  return Array.from(new Set((openids || []).filter(openid => typeof openid === 'string' && openid)))
}

function toText(value, maxLength = 120) {
  if (typeof value !== 'string') return ''
  return value.trim().slice(0, maxLength)
}

function toNullableNumber(value, min, max) {
  const numberValue = Number(value)
  if (!Number.isFinite(numberValue)) return null
  if (numberValue < min || numberValue > max) return null
  return numberValue
}

function normalizeAppointmentAt(value) {
  if (value === null || typeof value === 'undefined' || value === '') return null
  return toNullableNumber(value, 0, 4102444800000)
}

function normalizeTaskLocation(rawLocation) {
  const source = rawLocation && LOCATION_SOURCES.includes(rawLocation.source)
    ? rawLocation.source
    : ''
  const latitude = rawLocation ? toNullableNumber(rawLocation.latitude, -90, 90) : null
  const longitude = rawLocation ? toNullableNumber(rawLocation.longitude, -180, 180) : null
  const hasPoint = latitude !== null && longitude !== null
  const name = toText(rawLocation && rawLocation.name, 80)
  const address = toText(rawLocation && rawLocation.address, 160)

  if (!hasPoint) return null

  return {
    source: source || 'wx-choose-location',
    name,
    address,
    latitude: hasPoint ? latitude : null,
    longitude: hasPoint ? longitude : null,
    coordinateType: 'gcj02',
    poiId: toText(rawLocation && rawLocation.poiId, 80)
  }
}

function getImageFileId(rawImage) {
  const fileID = typeof rawImage === 'string'
    ? toText(rawImage, 512)
    : rawImage && typeof rawImage === 'object'
      ? toText(rawImage.fileID || rawImage.url || rawImage.imageUrl, 512)
      : ''
  return fileID.startsWith('cloud://') ? fileID : ''
}

function normalizeTaskImages(rawImages, fallbackImageUrl) {
  const imageValues = Array.isArray(rawImages) ? rawImages.slice() : []
  if (fallbackImageUrl) imageValues.push(fallbackImageUrl)

  const seen = {}
  return imageValues
    .map(getImageFileId)
    .filter(fileID => {
      if (!fileID || seen[fileID]) return false
      seen[fileID] = true
      return true
    })
    .slice(0, MAX_TASK_IMAGE_COUNT)
}

function toClientLocation(location) {
  if (!location) return null
  return {
    source: location.source || '',
    name: location.name || '',
    address: location.address || '',
    latitude: typeof location.latitude === 'number' ? location.latitude : null,
    longitude: typeof location.longitude === 'number' ? location.longitude : null,
    coordinateType: location.coordinateType || 'gcj02',
    poiId: location.poiId || ''
  }
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
  const location = toClientLocation(task.location)
  const appointmentAt = task.appointmentAt || task.deadline || null
  const images = normalizeTaskImages(task.images, task.imageUrl)
  return {
    _id: task._id,
    title: task.title,
    desc: task.desc || '',
    location,
    images,
    imageUrl: images[0] || '',
    appointmentAt,
    deadline: appointmentAt,
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
        const taskPayload = payload || {}
        const title = typeof taskPayload.title === 'string' ? taskPayload.title.trim() : ''
        if (!title) return { code: 400, message: '请填写任务名称' }
        const desc = toText(taskPayload.desc, 240)
        const location = normalizeTaskLocation(taskPayload.location)
        const appointmentAt = normalizeAppointmentAt(taskPayload.appointmentAt || taskPayload.deadline)
        const images = normalizeTaskImages(taskPayload.images, taskPayload.imageUrl)

        const spaceRes = await db.collection('spaces').where({ members: wxContext.OPENID }).limit(1).get()
        const space = spaceRes.data[0]
        if (!space) return { code: 404, message: '请先创建空间' }
        if (space.status !== SPACE_STATUS.ACTIVE) return { code: 400, message: '双方加入后才能创建任务' }

        const row = {
          _id: createTaskId(),
          creator: wxContext.OPENID,
          title,
          desc,
          location,
          images,
          imageUrl: images[0] || '',
          appointmentAt,
          deadline: appointmentAt,
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
            desc,
            location,
            imageUrl: task.imageUrl,
            imageCount: task.images.length,
            appointmentAt: task.appointmentAt,
            deadline: task.appointmentAt,
            status: task.status
          }
        })
        const sync = appendSyncChange(space, change)
        const tasks = [...(space.tasks || []), task]

        await db.collection('spaces').doc(space._id).update({ data: { tasks, sync } })
        return { code: 0, data: toClientTask(task) }
      }
      case 'updateTask': {
        if (!id) return { code: 400, message: '任务不存在' }

        const taskPayload = payload || {}
        const title = typeof taskPayload.title === 'string' ? taskPayload.title.trim() : ''
        if (!title) return { code: 400, message: '请填写任务名称' }

        const desc = toText(taskPayload.desc, 240)
        const location = normalizeTaskLocation(taskPayload.location)
        const appointmentAt = normalizeAppointmentAt(taskPayload.appointmentAt || taskPayload.deadline)
        const images = normalizeTaskImages(taskPayload.images, taskPayload.imageUrl)

        const spaceRes = await db.collection('spaces').where({ members: wxContext.OPENID }).limit(1).get()
        const space = spaceRes.data[0]
        if (!space) return { code: 404, message: '请先创建空间' }

        const tasks = space.tasks || []
        const taskIndex = tasks.findIndex(task => task && task._id === id)
        if (taskIndex < 0) return { code: 404, message: '任务不存在' }

        const task = tasks[taskIndex]
        const updatedTask = {
          ...task,
          title,
          desc,
          location,
          images,
          imageUrl: images[0] || '',
          appointmentAt,
          deadline: appointmentAt
        }
        const updatedTasks = tasks.map((row, index) => index === taskIndex ? updatedTask : row)
        const change = createSyncChange(space, {
          type: SYNC_EVENT_TYPES.TASK_UPDATED,
          actor: wxContext.OPENID,
          targetOpenids: space.members || [],
          entityType: 'task',
          entityId: id,
          payload: {
            title,
            appointmentAt,
            imageCount: images.length
          }
        })
        const sync = appendSyncChange(space, change)

        await db.collection('spaces').doc(space._id).update({ data: { tasks: updatedTasks, sync } })
        return { code: 0, data: toClientTask(updatedTask) }
      }
      case 'addTaskImages': {
        if (!id) return { code: 400, message: '任务不存在' }

        const incomingImages = normalizeTaskImages(payload && payload.images)
        if (incomingImages.length === 0) return { code: 400, message: '请先选择图片' }

        const spaceRes = await db.collection('spaces').where({ members: wxContext.OPENID }).limit(1).get()
        const space = spaceRes.data[0]
        if (!space) return { code: 404, message: '请先创建空间' }

        const tasks = space.tasks || []
        const taskIndex = tasks.findIndex(task => task && task._id === id)
        if (taskIndex < 0) return { code: 404, message: '任务不存在' }

        const task = tasks[taskIndex]
        const currentImages = normalizeTaskImages(task.images, task.imageUrl)
        if (currentImages.length >= MAX_TASK_IMAGE_COUNT) {
          return { code: 400, message: `最多上传 ${MAX_TASK_IMAGE_COUNT} 张图片` }
        }

        const images = normalizeTaskImages([...currentImages, ...incomingImages])
        if (images.length === currentImages.length) {
          return { code: 0, data: toClientTask({ ...task, images, imageUrl: images[0] || '' }) }
        }

        const updatedTask = {
          ...task,
          images,
          imageUrl: images[0] || ''
        }
        const updatedTasks = tasks.map((row, index) => index === taskIndex ? updatedTask : row)
        const change = createSyncChange(space, {
          type: SYNC_EVENT_TYPES.TASK_IMAGES_ADDED,
          actor: wxContext.OPENID,
          targetOpenids: space.members || [],
          entityType: 'task',
          entityId: id,
          payload: {
            title: task.title || '',
            imageCount: images.length
          }
        })
        const sync = appendSyncChange(space, change)

        await db.collection('spaces').doc(space._id).update({ data: { tasks: updatedTasks, sync } })
        return { code: 0, data: toClientTask(updatedTask) }
      }
      case 'deleteTask': {
        if (!id) return { code: 400, message: '任务不存在' }

        const spaceRes = await db.collection('spaces').where({ members: wxContext.OPENID }).limit(1).get()
        const space = spaceRes.data[0]
        if (!space) return { code: 404, message: '请先创建空间' }

        const tasks = space.tasks || []
        const taskIndex = tasks.findIndex(task => task && task._id === id)
        if (taskIndex < 0) return { code: 404, message: '任务不存在' }

        const task = tasks[taskIndex]
        const updatedTasks = tasks.filter((row, index) => index !== taskIndex)
        const change = createSyncChange(space, {
          type: SYNC_EVENT_TYPES.TASK_DELETED,
          actor: wxContext.OPENID,
          targetOpenids: space.members || [],
          entityType: 'task',
          entityId: id,
          payload: {
            title: task.title || ''
          }
        })
        const sync = appendSyncChange(space, change)

        await db.collection('spaces').doc(space._id).update({ data: { tasks: updatedTasks, sync } })
        return { code: 0, data: true }
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
