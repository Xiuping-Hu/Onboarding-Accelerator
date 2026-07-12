declare module 'mammoth' {
  export function extractRawText(input: { path: string }): Promise<{ value: string }>;
}
