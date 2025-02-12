import { prepareTemplate } from "./template-utils";

export function generatePageRoute({
  pageName,
  domain,
  routeFile,
}: {
  pageName: string;
  domain: string;
  routeFile: string;
}) {
  return prepareTemplate<{ pageName: string; domain: string }>({
    data: {
      pageName,
      domain,
    },
    domain,
    template: "route.ejs",
    templateRoot: "page",
    outputFile: `../routes/${routeFile}`,
  });
}

export function generateFormPage({
  formName,
  domain,
  pageName,
}: {
  formName?: string;
  domain: string;
  pageName: string;
}) {
  return prepareTemplate<{
    pageName: string;
    domain: string;
    formName?: string;
  }>({
    data: {
      formName: formName || "",
      pageName,
      domain,
    },
    domain,
    template: "page-with-form.ejs",
    templateRoot: "form",
    outputFile: `components/${pageName}/${pageName}.tsx`,
  });
}

export function generateFormSchema({
  formName,
  schemaName,
  domain,
}: {
  formName: string;
  schemaName: string;
  domain: string;
}) {
  return prepareTemplate<{
    formName: string;
    schemaName: string;
  }>({
    data: {
      formName,
      schemaName,
    },
    domain,
    template: "schema.ejs",
    templateRoot: "form",
    outputFile: `schemas/${schemaName}.ts`,
  });
}

export function generateFormAction({
  formName,
  actionName,
  schemaName,
  domain,
}: {
  formName: string;
  actionName: string;
  schemaName: string;
  domain: string;
}) {
  return prepareTemplate<{
    formName: string;
    actionName: string;
    schemaName: string;
  }>({
    data: {
      formName,
      actionName,
      schemaName,
    },
    domain,
    template: "action.ejs",
    templateRoot: "form",
    outputFile: `actions/${actionName}.server.ts`,
  });
}

export function generateFormComponent({
  actionName,
  formName,
  formTitle,
  schemaName,
  domain,
}: {
  actionName: string;
  formName: string;
  formTitle: string;
  schemaName: string;
  domain: string;
}) {
  return prepareTemplate<{
    actionName: string;
    formName: string;
    formTitle: string;
    schemaName: string;
  }>({
    data: {
      actionName,
      formName,
      formTitle,
      schemaName,
    },
    domain,
    template: "form.ejs",
    templateRoot: "form",
    outputFile: `components/${formName}Form/${formName}Form.tsx`,
  });
}

export function generateFormRoute({
  domain,
  routeFile,
  pageName,
  actionName,
}: {
  domain: string;
  routeFile: string;
  pageName: string;
  actionName: string;
}) {
  return prepareTemplate<{
    pageName: string;
    actionName: string;
    domain: string;
  }>({
    data: {
      actionName,
      pageName,
      domain,
    },
    domain,
    template: "route.ejs",
    templateRoot: "form",
    outputFile: `../routes/${routeFile}`,
  });
}
