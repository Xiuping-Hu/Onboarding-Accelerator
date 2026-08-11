declare module 'mammoth' {
  export function extractRawText(
    input: { path: string } | { buffer: Buffer },
  ): Promise<{ value: string }>;
}
