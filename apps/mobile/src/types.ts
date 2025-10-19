export type JoinPayload = {
  convId: string;
  saltB64: string;
  profile: 'desktop' | 'mobile';
};
