import { Question } from "../shared/questions";

export const formQuestions: Question[] = [
  {
    type: "input",
    name: "formName",
    message: "What is the name of your form?",
    validate: (input: string) => {
      if (!input.trim()) return "Form name cannot be empty";
      if (!/^[A-Z][A-Za-z0-9]*$/.test(input))
        return "Form name must be PascalCase";
      return true;
    },
  },
  // {
  //   type: 'input',
  //   name: 'description',
  //   message: 'Provide a brief description of the form:',
  //   validate: (input: string) => input.trim() !== ''
  // }
];
