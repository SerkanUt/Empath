export const NATIVE_EMOTIONS = [
  'angry',
  'disgust',
  'fear',
  'happy',
  'sad',
  'surprise',
  'neutral',
]

export const DERIVED_EMOTIONS = ['focus']

export const EMOTIONS = [...NATIVE_EMOTIONS, ...DERIVED_EMOTIONS, 'distracted']

export const EMOTION_LABELS = {
  focus: 'focus (derived)',
}

export const EMOTION_COLORS = {
  angry: '#ff6b4a',
  disgust: '#8fc16a',
  fear: '#a78bfa',
  happy: '#ffd23f',
  sad: '#5aa2ff',
  surprise: '#ff7eb6',
  neutral: '#9a99a8',
  focus: '#4fd1c5',
  distracted: '#c9b27c',
}

// One fixed shape per emotion, drawn in a 24x24 box. Colour is never the only signal.
export const EMOTION_SHAPES = {
  happy: 'M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18z',
  surprise: 'M12 2l2.9 6.6 7.1.7-5.4 4.7 1.6 7L12 17.3 5.8 21l1.6-7L2 9.3l7.1-.7z',
  sad: 'M12 2.5C8 8 5.5 11 5.5 14.5a6.5 6.5 0 0 0 13 0C18.5 11 16 8 12 2.5z',
  angry: 'M12 3L22 20H2z',
  fear: 'M12 2l9 10-9 10L3 12z',
  disgust: 'M12 2.5l8.5 4.9v9.2L12 21.5l-8.5-4.9V7.4z',
  neutral: 'M4.5 4.5h15v15h-15z',
  focus: 'M12 3.5a8.5 8.5 0 1 0 0 17a8.5 8.5 0 0 0 0-17zm0 4.5a4 4 0 1 1 0 8a4 4 0 0 1 0-8z',
  distracted: 'M3 10h18v4H3z',
}

export function emotionLabel(emotion) {
  return EMOTION_LABELS[emotion] || emotion
}

export function isDerivedEmotion(emotion) {
  return DERIVED_EMOTIONS.includes(emotion)
}

export function colorFor(emotion) {
  return EMOTION_COLORS[emotion] || EMOTION_COLORS.neutral
}

export function shapeFor(emotion) {
  return EMOTION_SHAPES[emotion] || EMOTION_SHAPES.neutral
}

// Dark ink that stays readable on every emotion colour.
export const EMOTION_INK = '#14141c'
