import readline from 'node:readline';

export async function promptChoice(
  message: string,
  options: string[],
  defaultIndex = 0
): Promise<string> {
  console.log(message);
  options.forEach((option, i) => {
    console.log(`  ${i + 1}) ${option}${i === defaultIndex ? '  (default)' : ''}`);
  });

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = (
      await new Promise<string>((resolve) => rl.question(`Choose [1-${options.length}]: `, resolve))
    ).trim();
    if (answer === '') return options[defaultIndex];
    const index = Number(answer) - 1;
    if (Number.isInteger(index) && index >= 0 && index < options.length) return options[index];
    const match = options.find((o) => o === answer);
    if (match) return match;
    throw new Error(`Invalid choice: ${answer}`);
  } finally {
    rl.close();
  }
}
