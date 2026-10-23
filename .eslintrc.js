// Guardrail for the injectable-logic-props pattern
// (ui-packages/ui-components/README.md, "Injectable Logic As Props"): a *Logic
// contract is a function the component invokes during its own render, so a
// consumer can supply the behaviour that runs there. An object type cannot be
// invoked, so it is not a logic prop.
//
// Only the shape is checked. Whether the function calls hooks is not part of
// the contract — the README says logic props *could* contain hooks — so a
// contract that just gathers values and returns them is valid, and that is the
// accepted cost of keeping one injection point per component.
//
// Only type aliases are matched. `*Logic` also names hook return types in this
// repo (`function useAppListLogic(): UseAppListLogic`), which are objects by
// design, so banning `interface *Logic` would reject 15 correct declarations.
// Telling the two apart needs the prop's type, which this rule cannot resolve.
const logicContractRules = [
  {
    selector: 'TSTypeAliasDeclaration[id.name=/Logic$/] > TSTypeLiteral',
    message:
      'A *Logic contract must be a function type: () => { ... }, because the component invokes it during its own render. An object type cannot be invoked, so it is plain props wearing the name — wrap it in a function, even if it only gathers values and returns them. See ui-packages/ui-components/README.md, "Injectable Logic As Props".',
  },
  {
    selector: 'TSTypeAliasDeclaration[id.name=/Logic$/] > TSIntersectionType',
    message:
      'A *Logic contract must be a function type. Intersect inside the return type instead: () => ReturnType<OtherLogic> & { ... }.',
  },
];

module.exports = {
  root: true,
  env: {
    browser: true,
    amd: true,
    node: true,
  },
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 13,
    sourceType: 'module',
    ecmaFeatures: {
      jsx: true,
    },
  },
  settings: {
    react: {
      version: 'detect',
    },
  },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react/recommended',
    'plugin:react-hooks/recommended',
    'plugin:prettier/recommended',
    'plugin:jsx-a11y/recommended',
    'plugin:storybook/recommended',
  ],
  plugins: ['simple-import-sort', 'prettier', 'jsx-a11y', 'formatjs'],
  rules: {
    'prettier/prettier': [
      'error',
      {},
      {
        usePrettierrc: true,
      },
    ],
    '@typescript-eslint/no-unused-expressions': 'off',
    '@typescript-eslint/no-namespace': 'off',
    '@typescript-eslint/no-var-requires': 'off',
    '@typescript-eslint/no-empty-function': 'warn',
    '@typescript-eslint/no-empty-interface': 'warn',
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/no-unused-vars': [
      'error',
      {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      },
    ],
    'no-return-await': 'error',
    'jsx-a11y/no-autofocus': ['error', { ignoreNonDOM: true }],
    'react/react-in-jsx-scope': 'off',
    'simple-import-sort/imports': 'error',
    'simple-import-sort/exports': 'error',
    'formatjs/enforce-description': ['error', 'literal'],
    'formatjs/enforce-default-message': ['error', 'literal'],
    'formatjs/enforce-placeholders': 'error',
    'formatjs/no-multiple-whitespaces': 'error',
    'formatjs/enforce-id': 'error',
  },
  overrides: [
    {
      files: ['*.ts', '*.mts', '*.cts', '*.tsx'],
      rules: {
        '@typescript-eslint/explicit-function-return-type': 'warn',
        'no-restricted-syntax': ['error', ...logicContractRules],
      },
    },
    {
      // The ui-components top-level barrel re-exports cloud-editor-only
      // components (e.g. DeviceAssociationDialog and all its board images),
      // so importing it from inside the package or from App Lab code drags
      // every export into the App Lab bundle. Deep imports like
      // '@cloud-editor-mono/ui-components/lib/components-by-app/app-lab'
      // remain allowed. Enforced in CI by
      // app/core-ui/src/architecture/barrelImports.test.ts.
      files: [
        'ui-packages/ui-components/**/*.{ts,tsx}',
        'app/core-ui/src/app-lab/**/*.{ts,tsx}',
        // App Lab imports the infrastructure barrel directly, so all of that layer
        // reaches its bundle; it reaches app/domain through deep service entries.
        // Both are covered whole: no service layer has a reason to pull the barrel.
        'app/domain/**/*.{ts,tsx}',
        'app/infrastructure/**/*.{ts,tsx}',
      ],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            paths: [
              '@cloud-editor-mono/ui-components',
              '@cloud-editor-mono/ui-components/lib',
              '@cloud-editor-mono/ui-components/lib/index',
            ].map((name) => ({
              name,
              message:
                'Do not import the ui-components top-level barrel: it pulls every export (board images included) into the bundle. Use a relative import inside the package, or a deep import like @cloud-editor-mono/ui-components/lib/<module> from apps.',
            })),
          },
        ],
      },
    },
  ],
};
