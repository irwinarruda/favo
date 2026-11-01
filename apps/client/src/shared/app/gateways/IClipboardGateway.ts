export type IClipboardGateway = {
  copy(text: string): Promise<boolean>;
};
