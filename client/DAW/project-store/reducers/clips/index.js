import firebase from '../../../../firebase';

// ACTION TYPES
const SET_CLIPS = 'SET_CLIPS';

// ACTION CREATORS
export const setClips = clips => ({
  type: SET_CLIPS,
  clips,
});

// REDUCER
export default function reducer(clips = [], action) {
  switch (action.type) {
    case SET_CLIPS:
      return action.clips;
    default:
      return clips;
  }
}

// THUNK CREATORS
export const setClipsThunk = (projectId, clips) => () => {
  clips.forEach((clip) => {
    firebase.database().ref(`${projectId}/clips`).push(clip);
  });
};

export const addClipThunk = (projectId, fileId, selectedTracks, time) => () => {
  selectedTracks.forEach((selectedTrack) => {
    const newClip = { fileId, track: selectedTrack, startTime: time, played: false, offset: 0 };
    firebase.database().ref(`${projectId}/clips`).push(newClip);
  });
};

export const updateClipThunk = (projectId, key, newClip) => () => {
  firebase.database().ref(`${projectId}/clips/${key}`).set(newClip);
};

export const deleteClip = (projectId, clipKey) => () => {
  firebase.database().ref(`${projectId}/clips/${clipKey}`).remove();
};
