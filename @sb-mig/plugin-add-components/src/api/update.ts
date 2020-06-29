import * as fs from 'fs';
import * as path from 'path';
import * as camelcase from 'camelcase';

export const updateComponentsJs = (components: any, copy: boolean, componentsMatchFile: string) => {

    let componentsImport = `// --- sb-mig scoped component imports ---\n`
    components.map((component: any, index: number) => {
        componentsImport = `${componentsImport}import * as Scoped${
            camelcase(component.name, { pascalCase: true })
            } from "${copy ? '.' : component.scope}/${component.name}";${index !== components.length - 1 ? `\n` : ''}`
    })

    let componentList = `// --- sb-mig scoped component list ---\n`
    components.map((component: any, index: number) => {
        componentList = `${componentList}Scoped${camelcase(component.name, { pascalCase: true })}.ComponentList,${index !== components.length - 1 ? `\n` : ''}`
    })

    fs.readFile(`${componentsMatchFile}`, 'utf-8', function (err, data) {
        if (err) throw err;

        let newValue = data.replace(/\/\/ --- sb-mig scoped component imports ---/gim, componentsImport);
        newValue = newValue.replace(/\/\/ --- sb-mig scoped component list ---/gim, componentList);

        fs.writeFile(`${componentsMatchFile}`, newValue, 'utf-8',  (err: any)  => {
            if (err) throw err;
            console.log('Done!');
        })
    })
}