export class ListRequestEpoch {
  private currentEpoch = 0;

  begin(replaceCurrentList: boolean): number {
    if (replaceCurrentList) this.currentEpoch += 1;
    return this.currentEpoch;
  }

  isCurrent(epoch: number): boolean {
    return epoch === this.currentEpoch;
  }
}
