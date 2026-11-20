import path from 'node:path';
import * as ts from 'typescript';

it('loads Expo CSS and Pressable web types without generated expo-env.d.ts', () => {
  const root = path.resolve(__dirname, '../..');
  const config = ts.readConfigFile(path.join(root, 'tsconfig.json'), ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
  const fixturePath = path.join(root, '__type_environment_probe__.ts');
  const fixture = ts.createSourceFile(fixturePath, `
    import type { PressableProps } from 'react-native';
    void import('@/global.css');
    const style: PressableProps['style'] = ({ pressed, hovered }) => ({
      opacity: pressed || hovered ? 0.6 : 1,
    });
    void style;
  `, ts.ScriptTarget.Latest, true);
  const host = ts.createCompilerHost(parsed.options);
  const getSourceFile = host.getSourceFile.bind(host);
  host.getSourceFile = (fileName, ...args) => path.resolve(fileName) === fixturePath
    ? fixture : getSourceFile(fileName, ...args);
  // Only the tracked declarations and the probe are roots, never Expo's generated files.
  const program = ts.createProgram([path.join(root, '@typings/index.d.ts'), fixturePath], parsed.options, host);
  const errors = ts.getPreEmitDiagnostics(program).filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error);
  expect(errors.map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'))).toEqual([]);
  expect(program.getSourceFiles().some((source) => path.basename(source.fileName) === 'expo-env.d.ts')).toBe(false);
});
