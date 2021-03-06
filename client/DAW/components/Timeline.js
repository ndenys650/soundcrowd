/* global navigator MediaRecorder Blob FormData OfflineAudioContext */

import React from 'react';
import { connect } from 'react-redux';
import axios from 'axios';
import { PlaybackControls, TrackList } from '../components';
import context from '../context';
import getUserMedia from '../getUserMedia';
import { setTime } from '../project-store/reducers/timeline/time';
import { setFiles, setFilesThunk, addFileThunk } from '../project-store/reducers/files';
import { setClips, setClipsThunk, addClipThunk } from '../project-store/reducers/clips';
import { setTracks, setTracksThunk, addTrackThunk } from '../project-store/reducers/tracks';
import { fetchReverbsThunk } from '../project-store/reducers/reverbs';
import { createSoundClips, setWaveform } from '../project-store/reducers/timeline/soundClips';
import { play, pause, playThunk } from '../project-store/reducers/timeline/isPlaying';
import { startRecord, stopRecord } from '../project-store/reducers/timeline/isRecording';
import { setPlayedAt, setPlayedAtThunk } from '../project-store/reducers/timeline/playedAt';
import { setStartThunk } from '../project-store/reducers/timeline/start';
import { setStartRecordTime } from '../project-store/reducers/timeline/startRecordTime';
import { setSelectedTracks } from '../project-store/reducers/timeline/selectedTracks';
import { setLength, setLengthThunk } from '../project-store/reducers/settings/length';
import { setTempo, setTempoThunk } from '../project-store/reducers/settings/tempo';
import firebase from '../../firebase';

class Timeline extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      playing: [],
      reverbBuffers: [],
    };
    this.checkAndPlay = this.checkAndPlay.bind(this);
    this.playSound = this.playSound.bind(this);
    this.tick = this.tick.bind(this);
    this.togglePlay = this.togglePlay.bind(this);
    this.startRecord = this.startRecord.bind(this);
    this.stopRecord = this.stopRecord.bind(this);
    this.addTrack = this.addTrack.bind(this);
    this.mixdown = this.mixdown.bind(this);
    this.trackEffectsLoop = this.trackEffectsLoop.bind(this);
    this.clipsRef = firebase.database().ref(`${this.props.projectId}/clips`);
    this.filesRef = firebase.database().ref(`${this.props.projectId}/files`);
    this.tracksRef = firebase.database().ref(`${this.props.projectId}/tracks`);
    this.tempoRef = firebase.database().ref(`${this.props.projectId}/settings/tempo`);
    this.lengthRef = firebase.database().ref(`${this.props.projectId}/settings/length`);
    this.mediaRecorder = null;
    this.audioChunks = [];
  }

  componentDidMount() {
    const {
      setFiles,
      addFileThunk,
      setClips,
      setTracks,
      setTempo,
      createSoundClips,
      projectId,
      addClipThunk,
      setLength,
      fetchReverbsThunk,
    } = this.props;

    // subscribe redux to firebase
    this.filesRef.on('value', (snapshot) => {
      const received = snapshot.val();
      const { soundClips } = this.props;
      setFiles(Object.assign({}, received));
      // createSoundClips checks for new files, gets them,
      // and puts the audio buffer in the soundClips object
      createSoundClips(received, soundClips);
    });
    this.clipsRef.on('value', (snapshot) => {
      const received = snapshot.val();
      setClips(Object.assign({}, received));
    });
    this.tracksRef.on('value', (snapshot) => {
      const received = snapshot.val();
      setTracks(Object.assign({}, received));
    });
    this.tempoRef.on('value', (snapshot) => {
      const received = snapshot.val();
      setTempo(received);
    });
    this.lengthRef.on('value', (snapshot) => {
      const received = snapshot.val();
      setLength(received);
    });

    // start listening for recording events
    if (getUserMedia) {
      navigator.getUserMedia({ audio: true },
        (stream) => {
          this.mediaRecorder = new MediaRecorder(stream);

          this.mediaRecorder.ondataavailable = (e) => {
            this.audioChunks.push(e.data);
          };

          this.mediaRecorder.onstop = () => {
            const blob = new Blob(this.audioChunks, { type: 'audio/ogg; codecs=opus' });
            this.audioChunks = [];

            const formData = new FormData();
            formData.set('blob', blob);
            axios({
              method: 'post',
              url: '/api/soundfiles',
              headers: { 'Content-Type': 'multipart/form-data' },
              data: formData,
            })
              .then(res => res.data)
              .then((file) => {
                addFileThunk(projectId, file);
                addClipThunk(
                  projectId,
                  file.id,
                  this.props.selectedTracks,
                  this.props.startRecordTime,
                );
              })
              .catch(console.error);
          };
        }, err => console.error(err));
    } else {
      console.error('getUserMedia not supported.');
    }
    // end recording section

    // get reverbs and store them on state
    const reverbs = {
      1: { id: 1, filename: '1st_baptist_nashville_far_close.wav', title: 'Nashville Church' },
      2: { id: 2, filename: 'empty_apartment_bedroom_06.wav', title: 'Empty Bedroom' },
      3: { id: 3, filename: 'st_georges_far.wav', title: 'St. Georges Episcopal Church' },
      4: { id: 4, filename: 'basement.wav', title: 'Basement' },
    };
    fetchReverbsThunk(reverbs);
  }

  componentWillUnmount() {
    this.clipsRef.off();
    this.tracksRef.off();
    this.filesRef.off();
    this.tempoRef.off();
    this.lengthRef.off();
  }

  playSound(buffer, startTime = 0, playAt, offset, duration, track) {
    const source = context.createBufferSource();
    source.buffer = buffer;
    this.trackEffectsLoop(source, track, context).connect(context.destination);
    source.start(playAt, startTime + offset, duration);
    this.setState({ playing: this.state.playing.concat(source) });
  }

  trackEffectsLoop(source, track, loopContext) {
    const { reverbs } = this.props;
    // effects loop settings
    // track volume settings
    const gainNode = loopContext.createGain();
    gainNode.gain.value = track.volume / 100;
    if (track.isMuted) {
      gainNode.gain.value = 0;
    }

    // eq settings
    const eqBand01 = loopContext.createBiquadFilter();
    eqBand01.type = 'lowshelf';
    eqBand01.frequency.value = 120;
    eqBand01.gain.value = track.eq.bands[1].gain; // in dBs

    const eqBand02 = loopContext.createBiquadFilter();
    eqBand02.type = 'peaking';
    eqBand02.frequency.value = 600;
    eqBand02.Q.value = track.eq.bands[2].q;
    eqBand02.gain.value = track.eq.bands[2].gain;

    const eqBand03 = loopContext.createBiquadFilter();
    eqBand03.type = 'peaking';
    eqBand03.frequency.value = 1000;
    eqBand03.Q.value = track.eq.bands[3].q;
    eqBand03.gain.value = track.eq.bands[3].gain;

    const eqBand04 = loopContext.createBiquadFilter();
    eqBand04.type = 'peaking';
    eqBand04.frequency.value = 1000;
    eqBand04.Q.value = track.eq.bands[4].q;
    eqBand04.gain.value = track.eq.bands[4].gain;

    const eqBand05 = loopContext.createBiquadFilter();
    eqBand05.type = 'peaking';
    eqBand05.frequency.value = 1000;
    eqBand05.Q.value = track.eq.bands[5].q;
    eqBand05.gain.value = track.eq.bands[5].gain;

    const eqBand06 = loopContext.createBiquadFilter();
    eqBand06.type = 'peaking';
    eqBand06.frequency.value = 1000;
    eqBand06.Q.value = track.eq.bands[6].q;
    eqBand06.gain.value = track.eq.bands[6].gain;

    const eqBand07 = loopContext.createBiquadFilter();
    eqBand07.type = 'peaking';
    eqBand07.frequency.value = 1000;
    eqBand07.Q.value = track.eq.bands[7].q;
    eqBand07.gain.value = track.eq.bands[7].gain;

    const eqBand08 = loopContext.createBiquadFilter();
    eqBand08.type = 'peaking';
    eqBand08.frequency.value = 1000;
    eqBand08.Q.value = track.eq.bands[8].q;
    eqBand08.gain.value = track.eq.bands[8].gain;

    const eqBand09 = loopContext.createBiquadFilter();
    eqBand09.type = 'peaking';
    eqBand09.frequency.value = 1000;
    eqBand09.Q.value = track.eq.bands[9].q;
    eqBand09.gain.value = track.eq.bands[9].gain;

    const eqBand10 = loopContext.createBiquadFilter();
    eqBand10.type = 'peaking';
    eqBand10.frequency.value = 1000;
    eqBand10.Q.value = track.eq.bands[10].q;
    eqBand10.gain.value = track.eq.bands[10].gain;

    const eqBand11 = loopContext.createBiquadFilter();
    eqBand11.type = 'peaking';
    eqBand11.frequency.value = 1000;
    eqBand11.Q.value = track.eq.bands[11].q;
    eqBand11.gain.value = track.eq.bands[11].gain;

    const eqBand12 = loopContext.createBiquadFilter();
    eqBand12.type = 'highshelf';
    eqBand12.frequency.value = 1000;
    eqBand12.Q.value = track.eq.bands[12].q;
    eqBand12.gain.value = track.eq.bands[12].gain;

    if (!track.eq.on) {
      eqBand01.gain.value = 0;
      eqBand02.gain.value = 0;
      eqBand03.gain.value = 0;
      eqBand04.gain.value = 0;
      eqBand05.gain.value = 0;
      eqBand06.gain.value = 0;
      eqBand07.gain.value = 0;
      eqBand08.gain.value = 0;
      eqBand09.gain.value = 0;
      eqBand10.gain.value = 0;
      eqBand11.gain.value = 0;
      eqBand12.gain.value = 0;
    }

    // compression settings
    const compressionNode = loopContext.createDynamicsCompressor();
    compressionNode.threshold.value = track.compressor.threshold;
    compressionNode.knee.value = track.compressor.knee;
    compressionNode.ratio.value = track.compressor.ratio;
    compressionNode.attack.value = track.compressor.attack;
    compressionNode.release.value = track.compressor.release;

    // reverb settings
    const convolverNode = loopContext.createConvolver();
    const convolverGain = loopContext.createGain();
    convolverNode.buffer = reverbs[track.reverb.id].audio.buffer;
    convolverGain.gain.value = track.reverb.gain;
    if (!track.reverb.on) {
      convolverGain.gain.value = 0;
    }

    // effects chain
    source.connect(eqBand01);
    eqBand01.connect(eqBand02);
    eqBand02.connect(eqBand03);
    eqBand03.connect(eqBand04);
    eqBand04.connect(eqBand05);
    eqBand05.connect(eqBand06);
    eqBand06.connect(eqBand07);
    eqBand07.connect(eqBand08);
    eqBand08.connect(eqBand09);
    eqBand09.connect(eqBand10);
    eqBand10.connect(eqBand11);
    eqBand11.connect(eqBand12);
    if (track.compressor.on) {
      eqBand12.connect(compressionNode);
      compressionNode.connect(convolverGain);
    } else {
      eqBand12.connect(convolverGain);
    }
    convolverGain.connect(convolverNode);
    convolverNode.connect(gainNode);
    if (track.compressor.on) {
      eqBand12.connect(compressionNode);
      compressionNode.connect(gainNode);
    } else {
      eqBand12.connect(gainNode);
    }

    return gainNode;
  }

  togglePlay() {
    const {
      isPlaying,
      pause,
      setPlayedAtThunk,
      playThunk,
      setStartThunk,
      time,
      clips,
      isRecording,
      stopRecord,
    } = this.props;
    if (!isPlaying) {
      setStartThunk(time)
        .then(() => playThunk())
        .then(() => setPlayedAtThunk(context.currentTime))
        .then(() => this.tick())
        .catch(console.error);
    } else {
      if (isRecording) {
        this.mediaRecorder.stop();
        stopRecord();
      }
      pause();
      this.state.playing.forEach((sound) => {
        sound.stop();
      });
      Object.keys(clips).forEach((key) => {
        clips[key].played = false;
      });
      this.setState({ playing: [] });
    }
  }

  tick() {
    const {
      time,
      playedAt,
      start,
      setTime,
      isPlaying,
      isRecording,
      length,
    } = this.props;

    setTime((context.currentTime - playedAt) + start);
    if (time > length) {
      this.togglePlay();
      return null;
    }
    this.checkAndPlay(time);
    if (this.mediaRecorder && this.mediaRecorder.state !== 'recording' && isRecording) {
      setTimeout(() => this.mediaRecorder.start(), 40);
    }
    return isPlaying && setTimeout(this.tick, 0);
  }

  checkAndPlay(time) {
    const { soundClips, isPlaying, clips, tracks } = this.props;
    Object.keys(clips).forEach((key) => {
      const clip = clips[key];
      if (isPlaying && time > clip.startTime && clip.track && !clip.played) {
        const track = tracks[clip.track];
        const soundClip = soundClips[clip.fileId];
        const playAt = context.currentTime + (clip.startTime - time);
        const { offset, duration } = clip;
        clip.played = true;
        this.playSound(
          soundClip.sound.buffer,
          time - clip.startTime,
          playAt,
          offset,
          duration,
          track);
      }
    });
  }

  startRecord() {
    const {
      time,
      selectedTracks,
      setStartRecordTime,
      isPlaying,
      isRecording,
      startRecord,
    } = this.props;

    if (!selectedTracks.length || isRecording) return;
    startRecord();
    setStartRecordTime(time);
    if (!isPlaying) {
      this.togglePlay();
    }
  }

  stopRecord() {
    const { isRecording, stopRecord, isPlaying } = this.props;
    if (!isRecording) return;
    stopRecord();
    if (isPlaying) {
      this.togglePlay(); // togglePlay will call this.mediaRecorder.stop();
    }
  }

  addTrack() {
    const { projectId, tracks, addTrackThunk } = this.props;
    const newTrackId = Object.keys(tracks).length + 1;

    const newTrack = { id: newTrackId,
      volume: 100,
      isMuted: false,
      reverb: { id: 1, on: false, gain: 1 },
      eq: {
        on: false,
        bands: {
          1: { f: 63, q: 4.318, gain: 0 },
          2: { f: 125, q: 4.318, gain: 0 },
          3: { f: 250, q: 4.318, gain: 0 },
          4: { f: 400, q: 4.318, gain: 0 },
          5: { f: 630, q: 4.318, gain: 0 },
          6: { f: 1000, q: 4.318, gain: 0 },
          7: { f: 1600, q: 4.318, gain: 0 },
          8: { f: 2500, q: 4.318, gain: 0 },
          9: { f: 4000, q: 4.318, gain: 0 },
          10: { f: 6300, q: 4.318, gain: 0 },
          11: { f: 10000, q: 4.318, gain: 0 },
          12: { f: 16000, q: 4.318, gain: 0 },
        },
      },
      compressor: {
        on: false,
        threshold: -24,
        knee: 30,
        ratio: 12,
        attack: 0.003,
        release: 0.25,
      },
    };
    addTrackThunk(projectId, newTrackId, newTrack);
  }


  mixdown(mixTitle, callback) {
    const { clips, soundClips, length, tracks } = this.props;
    const offlineContext = new OfflineAudioContext(2, length * 44100, 44100); // hardcoded to stereo
    const chunks = [];

    offlineContext.oncomplete = (e) => {
      const source = context.createBufferSource();
      const dest = context.createMediaStreamDestination();
      const mediaRecorder = new MediaRecorder(dest.stream);

      source.buffer = e.renderedBuffer; // this is the mixed-down audio buffer
      source.connect(dest); // this connects the mixed-down buffer to the mediaRecorder

      mediaRecorder.ondataavailable = (e) => {
        chunks.push(e.data);
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'audio/ogg; codecs=opus' });
        const formData = new FormData();

        formData.set('blob', blob);
        formData.set('mixTitle', mixTitle);
        axios({
          method: 'post',
          url: '/api/songs',
          headers: { 'Content-Type': 'multipart/form-data' },
          data: formData,
        })
          .then(res => res.data)
          .then((song) => {
            callback(song);
          })
          .catch(console.error);
      };

      mediaRecorder.start();
      source.start(0);
      setTimeout(() => mediaRecorder.stop(), (length * 1000));
    };

    Promise.all(Object.values(clips).map((clip) => {
      if (clip.track === null) {
        return null;
      }
      const track = tracks[clip.track];
      const newBufferSource = offlineContext.createBufferSource();
      const soundClip = soundClips[clip.fileId];
      const duration = clip.duration !== undefined ? clip.duration : soundClip.duration;
      newBufferSource.buffer = soundClip.sound.buffer;
      this.trackEffectsLoop(newBufferSource, track, offlineContext)
        .connect(offlineContext.destination);
      return newBufferSource.start(clip.startTime, clip.offset, duration);
    }))
      .then(() => offlineContext.startRendering());
  }

  render() {
    const { projectId, tracks } = this.props;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', position: 'relative', height: '100%' }}>
        <div className="project-controls">
          <PlaybackControls
            mixdown={this.mixdown}
            togglePlay={this.togglePlay}
            startRecord={this.startRecord}
            stopRecord={this.stopRecord}
            addTrack={this.addTrack}
            projectId={projectId}
          />
        </div>
        <TrackList projectId={projectId} tracks={tracks} />
      </div>
    );
  }
}

const mapState = (state, ownProps) => ({
  projectId: Number(ownProps.match.params.id),
  time: state.timeline.time,
  playedAt: state.timeline.playedAt,
  start: state.timeline.start,
  tempo: state.settings.tempo,
  isPlaying: state.timeline.isPlaying,
  soundClips: state.timeline.soundClips,
  files: state.files,
  clips: state.clips,
  tracks: state.tracks,
  selectedTracks: state.timeline.selectedTracks,
  startRecordTime: state.timeline.startRecordTime,
  length: state.settings.length,
  reverbs: state.reverbs,
  isRecording: state.timeline.isRecording,
});

const mapDispatch = dispatch => ({
  setTime: time => dispatch(setTime(time)),
  setFiles: files => dispatch(setFiles(files)),
  setFilesThunk: (projectId, files) => dispatch(setFilesThunk(projectId, files)),
  addFileThunk: (projectId, file) => dispatch(addFileThunk(projectId, file)),
  setClips: clips => dispatch(setClips(clips)),
  setClipsThunk: (projectId, clips) => dispatch(setClipsThunk(projectId, clips)),
  addClipThunk: (projectId, fileId, selectedTracks, time) =>
    dispatch(addClipThunk(projectId, fileId, selectedTracks, time)),
  addTrackThunk: (projectId, trackId, newTrack) =>
    dispatch(addTrackThunk(projectId, trackId, newTrack)),
  setTracks: tracks => dispatch(setTracks(tracks)),
  setTracksThunk: (projectId, tracks) => dispatch(setTracksThunk(projectId, tracks)),
  setTempo: tempo => dispatch(setTempo(tempo)),
  setTempoThunk: (projectId, tempo) => dispatch(setTempoThunk(projectId, tempo)),
  createSoundClips: (files, soundClips) => dispatch(createSoundClips(files, soundClips)),
  setWaveform: (fileId, waveform) => dispatch(setWaveform(fileId, waveform)),
  play: () => dispatch(play()),
  playThunk: () => dispatch(playThunk()),
  pause: () => dispatch(pause()),
  setPlayedAt: time => dispatch(setPlayedAt(time)),
  setPlayedAtThunk: time => dispatch(setPlayedAtThunk(time)),
  setStartThunk: start => dispatch(setStartThunk(start)),
  setSelectedTracks: selectedTracks => dispatch(setSelectedTracks(selectedTracks)),
  setStartRecordTime: time => dispatch(setStartRecordTime(time)),
  setLength: length => dispatch(setLength(length)),
  setLengthThunk: (projectId, length) => dispatch(setLengthThunk(projectId, length)),
  fetchReverbsThunk: reverbs => dispatch(fetchReverbsThunk(reverbs)),
  startRecord: () => dispatch(startRecord()),
  stopRecord: () => dispatch(stopRecord()),
});

export default connect(mapState, mapDispatch)(Timeline);
