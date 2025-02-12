import { input, select } from '@inquirer/prompts';

export type Question = {
  type: 'input' | 'select';
  name: string;
  message: string;
  choices?: Array<{ value: string; name: string }>;
  validate?: (input: string) => boolean | string;
};

export async function askQuestions(questions: Question[]): Promise<Record<string, any>> {
  const answers: Record<string, any> = {};

  for (const question of questions) {
    if (question.type === 'input') {
      answers[question.name] = await input({
        message: question.message,
        validate: question.validate
      });
    } else if (question.type === 'select' && question.choices) {
      answers[question.name] = await select({
        message: question.message,
        choices: question.choices
      });
    }
  }

  return answers;
}
