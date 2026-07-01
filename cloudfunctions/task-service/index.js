const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

const SPACE_STATUS = {
  ACTIVE: 'active',
  DISSOLVED: 'dissolved'
}

const TASK_KIND = {
  SELF: 'self',
  TOGETHER: 'together',
  FOR_PARTNER: 'for_partner'
}

const TASK_STATUS = {
  PENDING: 'pending',
  ACTIVE: 'active',
  COMPLETED: 'completed',
  DECLINED: 'declined'
}

const SYNC_EVENT_TYPES = {
  TASK_CREATED: 'TASK_CREATED',
  TASK_PROPOSED: 'TASK_PROPOSED',
  TASK_ACCEPTED: 'TASK_ACCEPTED',
  TASK_DECLINED: 'TASK_DECLINED',
  TASK_PARTICIPANT_COMPLETED: 'TASK_PARTICIPANT_COMPLETED',
  TASK_COMPLETED: 'TASK_COMPLETED',
  TASK_DELETED: 'TASK_DELETED',
  TASK_REPLIED: 'TASK_REPLIED'
}

const LOCATION_SOURCES = ['wx-choose-location', 'qqmap-poi', 'qqmap-center']
const MAX_TASK_IMAGE_COUNT = 9
const MAX_RESPONSE_NOTE_LENGTH = 120
const MAX_REPLY_TEXT_LENGTH = 500
const MAX_TRANSACTION_ATTEMPTS = 3

function getUniqueOpenids(openids) {
  return Array.from(new Set((openids || []).filter(openid => typeof openid === 'string' && openid)))
}

function toText(value, maxLength = 120) {
  if (typeof value !== 'string') return ''
  return value.trim().slice(0, maxLength)
}

function getErrorText(error) {
  if (!error) return ''
  return [
    error.errCode,
    error.code,
    error.errMsg,
    error.message
  ].filter(Boolean).join(' ')
}

function isRetryableTransactionError(error) {
  return /transaction|conflict|retry|write conflict|事务|冲突/i.test(getErrorText(error))
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

function normalizeTaskKind(value) {
  return Object.values(TASK_KIND).includes(value) ? value : ''
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
    latitude,
    longitude,
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

function createShareToken() {
  return `share_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}

function createReplyId() {
  return `reply_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
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

function getTaskParticipants(task) {
  return getUniqueOpenids(task && task.participantOpenids)
}

function getCompletedOpenids(task) {
  const participants = getTaskParticipants(task)
  return getUniqueOpenids(task && task.completedOpenids).filter(openid => participants.includes(openid))
}


function toClientReplies(replies, openid) {
  if (!Array.isArray(replies)) return []
  return replies
    .filter(reply => reply && reply._id)
    .map(reply => {
      const images = normalizeTaskImages(reply.images)
      const isMine = reply.author === openid
      return {
        _id: reply._id,
        text: reply.text || '',
        images,
        imageUrl: images[0] || '',
        createdAt: reply.createdAt || null,
        isMine,
        authorLabel: isMine ? '我' : 'TA',
        avatarUrl: ''
      }
    })
}

function toClientTask(task, openid) {
  const location = toClientLocation(task.location)
  const appointmentAt = task.appointmentAt || null
  const images = normalizeTaskImages(task.images, task.imageUrl)
  const participants = getTaskParticipants(task)
  const completedOpenids = getCompletedOpenids(task)
  const isCreator = task.creator === openid
  const isTarget = task.targetOpenid === openid
  const isParticipant = participants.includes(openid)
  const isMineCompleted = completedOpenids.includes(openid)
  const isPartnerCompleted = completedOpenids.some(completedOpenid => completedOpenid !== openid)
  const isOpen = task.status === TASK_STATUS.PENDING || task.status === TASK_STATUS.ACTIVE

  return {
    _id: task._id,
    title: task.title,
    desc: task.desc || '',
    location,
    images,
    imageUrl: images[0] || '',
    appointmentAt,
    kind: task.kind,
    status: task.status,
    responseNote: task.responseNote || '',
    responseAt: task.responseAt || null,
    createdAt: task.createdAt,
    completedAt: task.completedAt || null,
    replies: toClientReplies(task.replies, openid),
    completion: {
      requiredCount: participants.length,
      completedCount: completedOpenids.length,
      isMineCompleted,
      isPartnerCompleted
    },
    permissions: {
      isCreator,
      canAccept: task.status === TASK_STATUS.PENDING && isTarget,
      canDecline: task.status === TASK_STATUS.PENDING && isTarget,
      canComplete: task.status === TASK_STATUS.ACTIVE && isParticipant && !isMineCompleted,
      canDelete: isCreator,
      canShare: isCreator && isOpen
    },
    shareToken: isCreator && isOpen ? task.shareToken || '' : ''
  }
}

async function getActiveSpace(openid, inactiveMessage) {
  const spaceRes = await db.collection('spaces').where({ members: openid }).limit(10).get()
  const spaces = spaceRes.data || []
  const activeSpace = spaces.find(space => space && space.status === SPACE_STATUS.ACTIVE)
  if (activeSpace) return { space: activeSpace }

  const currentSpace = spaces.find(space => space && space.status !== SPACE_STATUS.DISSOLVED)
  if (!currentSpace) return { response: { code: 404, message: '请先创建空间' } }
  return { response: { code: 400, message: inactiveMessage || '双方加入后才能操作约定' } }
}

function getPartnerOpenid(space, openid) {
  const members = getUniqueOpenids(space && space.members)
  if (members.length !== 2 || !members.includes(openid)) return ''
  return members.find(memberOpenid => memberOpenid !== openid) || ''
}

function getParticipants(kind, creator, targetOpenid) {
  if (kind === TASK_KIND.SELF) return [creator]
  if (kind === TASK_KIND.TOGETHER) return [creator, targetOpenid]
  if (kind === TASK_KIND.FOR_PARTNER) return [targetOpenid]
  return []
}

async function addTaskReplyInTransaction({ openid, spaceId, taskId, text, images }) {
  const reply = {
    _id: createReplyId(),
    author: openid,
    text,
    images,
    createdAt: Date.now()
  }

  let lastError = null
  for (let attempt = 0; attempt < MAX_TRANSACTION_ATTEMPTS; attempt += 1) {
    try {
      return await db.runTransaction(async transaction => {
        const spaceRes = await transaction.collection('spaces').doc(spaceId).get()
        const space = spaceRes.data
        if (!space || space.status === SPACE_STATUS.DISSOLVED) {
          return { response: { code: 404, message: '请先创建空间' } }
        }
        if (space.status !== SPACE_STATUS.ACTIVE) {
          return { response: { code: 400, message: '双方加入后才能操作约定' } }
        }

        const members = getUniqueOpenids(space.members || [])
        if (!members.includes(openid)) return { response: { code: 403, message: '只有空间成员可以回复' } }

        const tasks = space.tasks || []
        const taskIndex = tasks.findIndex(task => task && task._id === taskId)
        if (taskIndex < 0) return { response: { code: 404, message: '约定不存在' } }

        const task = tasks[taskIndex]
        const currentReplies = Array.isArray(task.replies) ? task.replies : []
        if (currentReplies.some(item => item && item._id === reply._id)) {
          return { task }
        }

        const updatedTask = {
          ...task,
          replies: [...currentReplies, reply]
        }
        const updatedTasks = tasks.map((row, index) => index === taskIndex ? updatedTask : row)
        const change = createSyncChange(space, {
          type: SYNC_EVENT_TYPES.TASK_REPLIED,
          actor: openid,
          targetOpenids: members,
          entityType: 'task',
          entityId: taskId,
          payload: {
            title: task.title || '',
            replyId: reply._id,
            hasText: !!text,
            hasImages: images.length > 0
          }
        })
        const sync = appendSyncChange(space, change)

        await transaction.collection('spaces').doc(spaceId).update({ data: { tasks: updatedTasks, sync } })
        return { task: updatedTask }
      })
    } catch (error) {
      lastError = error
      if (!isRetryableTransactionError(error) || attempt === MAX_TRANSACTION_ATTEMPTS - 1) throw error
    }
  }
  throw lastError
}

exports.main = async (event) => {
  const wxContext = cloud.getWXContext()
  const { action, payload = {}, id } = event

  try {
    switch (action) {
      case 'createTask': {
        const taskPayload = payload || {}
        const title = toText(taskPayload.title, 40)
        const kind = normalizeTaskKind(taskPayload.kind)
        if (!title) return { code: 400, message: '请填写约定名称' }
        if (!kind) return { code: 400, message: '请选择约定类型' }

        const spaceResult = await getActiveSpace(wxContext.OPENID, '双方加入后才能创建约定')
        if (spaceResult.response) return spaceResult.response
        const space = spaceResult.space
        const partnerOpenid = getPartnerOpenid(space, wxContext.OPENID)
        if (!partnerOpenid) return { code: 400, message: '空间成员状态异常，请稍后再试' }

        const desc = toText(taskPayload.desc, 240)
        const location = normalizeTaskLocation(taskPayload.location)
        const appointmentAt = normalizeAppointmentAt(taskPayload.appointmentAt)
        const images = normalizeTaskImages(taskPayload.images, taskPayload.imageUrl)
        const targetOpenid = kind === TASK_KIND.SELF ? '' : partnerOpenid
        const status = kind === TASK_KIND.SELF ? TASK_STATUS.ACTIVE : TASK_STATUS.PENDING
        const task = {
          _id: createTaskId(),
          creator: wxContext.OPENID,
          targetOpenid,
          participantOpenids: getParticipants(kind, wxContext.OPENID, targetOpenid),
          completedOpenids: [],
          kind,
          title,
          desc,
          location,
          images,
          imageUrl: images[0] || '',
          appointmentAt,
          status,
          responseNote: '',
          responseAt: null,
          shareToken: createShareToken(),
          createdAt: Date.now(),
          completedAt: null,
          replies: []
        }
        const eventType = kind === TASK_KIND.SELF ? SYNC_EVENT_TYPES.TASK_CREATED : SYNC_EVENT_TYPES.TASK_PROPOSED
        const change = createSyncChange(space, {
          type: eventType,
          actor: wxContext.OPENID,
          targetOpenids: [partnerOpenid],
          entityType: 'task',
          entityId: task._id,
          payload: { title, kind, status }
        })
        const sync = appendSyncChange(space, change)
        const tasks = [...(space.tasks || []), task]

        await db.collection('spaces').doc(space._id).update({ data: { tasks, sync } })
        return { code: 0, data: toClientTask(task, wxContext.OPENID) }
      }
      case 'respondTask': {
        if (!id) return { code: 400, message: '约定不存在' }
        const decision = payload && payload.decision
        if (decision !== 'accept' && decision !== 'decline') return { code: 400, message: '回应无效' }

        const spaceResult = await getActiveSpace(wxContext.OPENID)
        if (spaceResult.response) return spaceResult.response
        const space = spaceResult.space
        const tasks = space.tasks || []
        const taskIndex = tasks.findIndex(task => task && task._id === id)
        if (taskIndex < 0) return { code: 404, message: '约定不存在' }

        const task = tasks[taskIndex]
        if (task.status !== TASK_STATUS.PENDING) return { code: 400, message: '这份约定已被处理' }
        if (task.targetOpenid !== wxContext.OPENID) return { code: 403, message: '只有受邀的 TA 可以回应' }

        const responseAt = Date.now()
        const updatedTask = {
          ...task,
          status: decision === 'accept' ? TASK_STATUS.ACTIVE : TASK_STATUS.DECLINED,
          responseNote: toText(payload && payload.note, MAX_RESPONSE_NOTE_LENGTH),
          responseAt,
          completedAt: null
        }
        const updatedTasks = tasks.map((row, index) => index === taskIndex ? updatedTask : row)
        const change = createSyncChange(space, {
          type: decision === 'accept' ? SYNC_EVENT_TYPES.TASK_ACCEPTED : SYNC_EVENT_TYPES.TASK_DECLINED,
          actor: wxContext.OPENID,
          targetOpenids: [task.creator],
          entityType: 'task',
          entityId: id,
          payload: { title: task.title || '', kind: task.kind, note: updatedTask.responseNote }
        })
        const sync = appendSyncChange(space, change)

        await db.collection('spaces').doc(space._id).update({ data: { tasks: updatedTasks, sync } })
        return { code: 0, data: toClientTask(updatedTask, wxContext.OPENID) }
      }
      case 'completeTask': {
        if (!id) return { code: 400, message: '约定不存在' }

        const spaceResult = await getActiveSpace(wxContext.OPENID)
        if (spaceResult.response) return spaceResult.response
        const space = spaceResult.space
        const tasks = space.tasks || []
        const taskIndex = tasks.findIndex(task => task && task._id === id)
        if (taskIndex < 0) return { code: 404, message: '约定不存在' }

        const task = tasks[taskIndex]
        if (task.status !== TASK_STATUS.ACTIVE) return { code: 400, message: '这份约定还不能完成' }

        const participants = getTaskParticipants(task)
        if (!participants.includes(wxContext.OPENID)) return { code: 403, message: '这份约定不需要你完成' }

        const completedOpenids = getCompletedOpenids(task)
        if (completedOpenids.includes(wxContext.OPENID)) return { code: 400, message: '你已经完成过这份约定' }

        const nextCompletedOpenids = [...completedOpenids, wxContext.OPENID]
        const isFullyCompleted = nextCompletedOpenids.length === participants.length
        const completedAt = isFullyCompleted ? Date.now() : null
        const updatedTask = {
          ...task,
          completedOpenids: nextCompletedOpenids,
          status: isFullyCompleted ? TASK_STATUS.COMPLETED : TASK_STATUS.ACTIVE,
          completedAt
        }
        const updatedTasks = tasks.map((row, index) => index === taskIndex ? updatedTask : row)
        const change = createSyncChange(space, {
          type: isFullyCompleted ? SYNC_EVENT_TYPES.TASK_COMPLETED : SYNC_EVENT_TYPES.TASK_PARTICIPANT_COMPLETED,
          actor: wxContext.OPENID,
          targetOpenids: space.members || [],
          entityType: 'task',
          entityId: id,
          payload: {
            title: task.title || '',
            kind: task.kind,
            completedCount: nextCompletedOpenids.length,
            requiredCount: participants.length
          }
        })
        const sync = appendSyncChange(space, change)

        await db.collection('spaces').doc(space._id).update({ data: { tasks: updatedTasks, sync } })
        return { code: 0, data: toClientTask(updatedTask, wxContext.OPENID) }
      }
      case 'addTaskReply': {
        if (!id) return { code: 400, message: '约定不存在' }

        const text = toText(payload && payload.text, MAX_REPLY_TEXT_LENGTH)
        const images = normalizeTaskImages(payload && payload.images)
        if (!text && images.length === 0) return { code: 400, message: '写点文字或选张图片吧' }

        const spaceResult = await getActiveSpace(wxContext.OPENID)
        if (spaceResult.response) return spaceResult.response

        const result = await addTaskReplyInTransaction({
          openid: wxContext.OPENID,
          spaceId: spaceResult.space._id,
          taskId: id,
          text,
          images
        })
        if (result.response) return result.response
        return { code: 0, data: toClientTask(result.task, wxContext.OPENID) }
      }
      case 'deleteTask': {
        if (!id) return { code: 400, message: '约定不存在' }

        const spaceResult = await getActiveSpace(wxContext.OPENID)
        if (spaceResult.response) return spaceResult.response
        const space = spaceResult.space
        const tasks = space.tasks || []
        const taskIndex = tasks.findIndex(task => task && task._id === id)
        if (taskIndex < 0) return { code: 404, message: '约定不存在' }

        const task = tasks[taskIndex]
        if (task.creator !== wxContext.OPENID) return { code: 403, message: '只有创建者可以删除约定' }

        const updatedTasks = tasks.filter((row, index) => index !== taskIndex)
        const change = createSyncChange(space, {
          type: SYNC_EVENT_TYPES.TASK_DELETED,
          actor: wxContext.OPENID,
          targetOpenids: space.members || [],
          entityType: 'task',
          entityId: id,
          payload: { title: task.title || '' }
        })
        const sync = appendSyncChange(space, change)

        await db.collection('spaces').doc(space._id).update({ data: { tasks: updatedTasks, sync } })
        return { code: 0, data: true }
      }
      case 'resolveTaskShare': {
        const shareToken = toText(event.shareToken, 160)
        if (!id || !shareToken) return { code: 403, message: '这是私密约定' }

        const spaceResult = await getActiveSpace(wxContext.OPENID)
        if (spaceResult.response) return { code: 403, message: '这是私密约定' }
        const task = (spaceResult.space.tasks || []).find(item => item && item._id === id)
        if (!task || task.shareToken !== shareToken || ![TASK_STATUS.PENDING, TASK_STATUS.ACTIVE].includes(task.status)) {
          return { code: 403, message: '这是私密约定' }
        }
        return { code: 0, data: { id: task._id } }
      }
      default:
        return { code: 400, message: `unknown action: ${action}` }
    }
  } catch (error) {
    return { code: 500, message: error.message }
  }
}
