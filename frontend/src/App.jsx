import React, { useEffect, useState } from 'react'
import { api } from './api.js'
import SceneSetup from './components/SceneSetup.jsx'
import ControlMode from './components/ControlMode.jsx'
import CalibrationMode from './components/CalibrationMode.jsx'
import TestMode from './components/TestMode.jsx'
import ResultsDashboard from './components/ResultsDashboard.jsx'
import LiveDetector from './components/LiveDetector.jsx'

// Internal tab ids stay the same; the labels are what people read.
const TABS = ['Scenes', 'Control', 'Calibration', 'Test', 'Results', 'Live']
const TAB_LABELS = {
  Scenes: 'Video',
  Control: 'Intent',
  Calibration: 'Warm-up',
  Test: 'Watch',
  Results: 'Results',
  Live: 'Live',
}

export default function App() {
  const [scenes, setScenes] = useState([])
  const [selectedScene, setSelectedScene] = useState(null)
  const [controlSessions, setControlSessions] = useState([])
  const [calibrationSessions, setCalibrationSessions] = useState([])
  const [testSessions, setTestSessions] = useState([])
  const [activeTab, setActiveTab] = useState('Scenes')

  async function refreshScenes() {
    const list = await api.listScenes()
    setScenes(list)
    return list
  }

  async function refreshSessions(scene) {
    if (!scene) return
    const [ctrl, cal, test] = await Promise.all([
      api.listControlSessions(scene.id),
      api.listCalibrationSessions(scene.id),
      api.listTestSessions(scene.id),
    ])
    setControlSessions(ctrl)
    setCalibrationSessions(cal)
    setTestSessions(test)
  }

  useEffect(() => {
    refreshScenes()
  }, [])

  useEffect(() => {
    refreshSessions(selectedScene)
  }, [selectedScene])

  function selectScene(scene) {
    setSelectedScene(scene)
    setActiveTab('Control')
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>Reel<span>Reaction</span></h1>
        <nav className="nav-tabs" aria-label="Steps">
          {TABS.map((tab, i) => {
            const locked = tab !== 'Scenes' && tab !== 'Live' && !selectedScene
            const done = !locked && tab !== 'Live' && TABS.indexOf(activeTab) > i && activeTab !== 'Live'
            return (
              <button
                key={tab}
                className={`${activeTab === tab ? 'active' : ''} ${done ? 'done' : ''}`}
                onClick={() => setActiveTab(tab)}
                disabled={locked}
                aria-current={activeTab === tab ? 'step' : undefined}
              >
                {TAB_LABELS[tab]}
              </button>
            )
          })}
        </nav>
      </header>

      {selectedScene && activeTab !== 'Scenes' && activeTab !== 'Live' && (
        <p className="scene-crumb">
          Testing <strong>{selectedScene.title}</strong>
        </p>
      )}

      {activeTab === 'Scenes' && (
        <SceneSetup
          scenes={scenes}
          onScenesChanged={refreshScenes}
          selectedScene={selectedScene}
          onSelectScene={selectScene}
        />
      )}

      {activeTab === 'Control' && selectedScene && (
        <ControlMode
          scene={selectedScene}
          onSaved={async () => {
            await refreshSessions(selectedScene)
            setActiveTab('Calibration')
          }}
        />
      )}

      {activeTab === 'Calibration' && selectedScene && (
        <CalibrationMode
          scene={selectedScene}
          calibrationSessions={calibrationSessions}
          testSessions={testSessions}
          onSaved={async () => {
            await refreshSessions(selectedScene)
            setActiveTab('Test')
          }}
        />
      )}

      {activeTab === 'Test' && selectedScene && (
        <TestMode
          scene={selectedScene}
          calibrationSessions={calibrationSessions}
          testSessions={testSessions}
          onSaved={async () => {
            await refreshSessions(selectedScene)
            setActiveTab('Results')
          }}
        />
      )}

      {activeTab === 'Results' && selectedScene && (
        <ResultsDashboard
          scene={selectedScene}
          controlSessions={controlSessions}
          calibrationSessions={calibrationSessions}
          testSessions={testSessions}
          onGo={setActiveTab}
          onSessionsChanged={() => refreshSessions(selectedScene)}
        />
      )}

      {activeTab === 'Live' && <LiveDetector />}
    </div>
  )
}
