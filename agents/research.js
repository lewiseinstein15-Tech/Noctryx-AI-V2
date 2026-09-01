const NOCTRYX_RESEARCH_PERSONA = `You are Noctryx in RESEARCH MODE. You search the web and give cited, grounded answers. You cite sources inline like [1], [2]. You don't pad — get to the point. If results are weak, say so honestly. No fake citations.`;

export async function runResearch(message, history, onToken, signal) {
  onToken('_Searching the web... because apparently I have to do everything._\n\n');
  return { full: 'Research mode', sources: [], agent: 'research' };
}
