import React from 'react';
import { connect } from 'react-redux';
import Draggable from 'react-draggable';
import { setTime } from '../project-store/reducers/timeline/time';

const attrs = {
  width: 20,
  color: '#e22',
};

const styles = {
  marker: {
    position: 'absolute',
    top: '0',
    left: `${attrs.width / 2}px`,
    width: `${attrs.width}px`,
    height: '100%',
    cursor: 'col-resize',
    boxShadow: `0 1px 0 ${attrs.color}`,
  },
  point: {
    position: 'absolute',
    top: `-${attrs.width / 4}px`,
    width: '0',
    height: '0',
    borderTop: `${attrs.width / 2}px solid ${attrs.color}`,
    borderLeft: `${attrs.width / 2}px solid transparent`,
    borderRight: `${attrs.width / 2}px solid transparent`,
  },
  line: {
    position: 'absolute',
    left: `${attrs.width / 2}px`,
    width: '1px',
    height: '100%',
    background: '#e22',
  },
};

class PlaybackMarker extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      x: 0,
      y: 0,
    };

    this.handleDrag = this.handleDrag.bind(this);
    this.handleEnd = this.handleEnd.bind(this);
  }

  componentWillReceiveProps(newProps) {
    this.setState({ x: newProps.time * newProps.zoom });
  }

  handleDrag(e, data) {
    this.setState({ x: data.x });
  }

  handleEnd(e, data) {
    const { updateTime, zoom } = this.props;
    updateTime(data.lastX / zoom);
  }

  render() {
    return (
      <Draggable
        axis="x"
        bounds=".track-list"
        onDrag={this.handleDrag}
        onStop={this.handleEnd}
        position={this.state}
      >
        <div style={styles.marker}>
          <span style={styles.point} />
          <span style={styles.line} />
        </div>
      </Draggable>
    );
  }
}

const mapState = state => ({
  time: state.timeline.time,
});

const mapDispatch = dispatch => ({
  updateTime: time => dispatch(setTime(time)),
});

export default connect(mapState, mapDispatch)(PlaybackMarker);
