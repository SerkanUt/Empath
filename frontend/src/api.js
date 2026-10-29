const BASE = '/api'

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`${res.status} ${res.statusText}: ${body}`)
  }
  return res.json()
}

async function uploadRequest(path, file) {
  const formData = new FormData()
  formData.append('file', file)
  const res = await fetch(`${BASE}${path}`, { method: 'POST', body: formData })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`${res.status} ${res.statusText}: ${body}`)
  }
  return res.json()
}

export const SUPPORTED_VIDEO_FORMATS = ['MP4', 'WebM', 'OGG', 'MOV', 'M4V']

export const api = {
  listScenes: () => request('/scenes'),
  createScene: (data) => request('/scenes', { method: 'POST', body: JSON.stringify(data) }),
  uploadSceneVideo: (file) => uploadRequest('/scenes/upload', file),
  getScene: (id) => request(`/scenes/${id}`),

  listControlSessions: (sceneId) => request(`/scenes/${sceneId}/control-sessions`),
  createControlSession: (sceneId, data) =>
    request(`/scenes/${sceneId}/control-sessions`, { method: 'POST', body: JSON.stringify(data) }),

  listCalibrationSessions: (sceneId) => request(`/scenes/${sceneId}/calibration-sessions`),
  createCalibrationSession: (sceneId, data) =>
    request(`/scenes/${sceneId}/calibration-sessions`, { method: 'POST', body: JSON.stringify(data) }),

  deleteTestSession: (id) => request(`/test-sessions/${id}`, { method: 'DELETE' }),
  listTestSessions: (sceneId) => request(`/scenes/${sceneId}/test-sessions`),
  createTestSession: (sceneId, data) =>
    request(`/scenes/${sceneId}/test-sessions`, { method: 'POST', body: JSON.stringify(data) }),

  detectEmotion: (imageBase64) =>
    request('/detect-emotion', { method: 'POST', body: JSON.stringify({ image_base64: imageBase64 }) }),

  score: (testSessionId, controlSessionId, auConfig) =>
    request('/score', {
      method: 'POST',
      body: JSON.stringify({
        test_session_id: testSessionId,
        control_session_id: controlSessionId,
        ...(auConfig ? { au_config: auConfig } : {}),
      }),
    }),
}
