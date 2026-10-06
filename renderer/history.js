// One history boundary for all document mutations; UI state stays outside it.
export class EditHistory {
  constructor(state, limit = 100) { this.state = state; this.limit = limit; }
  checkpoint(snapshot = JSON.stringify(this.state.annots)) {
    this.state.undo.push(snapshot);
    if (this.state.undo.length > this.limit) this.state.undo.shift();
    this.state.redo = [];
  }
  step(direction) {
    const from = this.state[direction], to = this.state[direction === 'undo' ? 'redo' : 'undo'];
    if (!from.length) return null;
    to.push(JSON.stringify(this.state.annots));
    return JSON.parse(from.pop());
  }
}
