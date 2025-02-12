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
