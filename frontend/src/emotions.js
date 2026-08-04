export const EMOTIONS = ['angry', 'disgust', 'fear', 'happy', 'sad', 'surprise', 'neutral', 'distracted']

export const EMOTION_COLORS = {
  angry: '#e4572e',
  disgust: '#7a9b52',
  fear: '#8067b7',
  happy: '#e8b23d',
  sad: '#4083c9',
  surprise: '#e67aa6',
  neutral: '#57565f',
  distracted: '#9a8b6e',
}

export function colorFor(emotion) {
  return EMOTION_COLORS[emotion] || EMOTION_COLORS.neutral
}
