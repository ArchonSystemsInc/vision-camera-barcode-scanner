// https://github.com/facebook/react-native/blob/master/packages/eslint-config-react-native-community/index.js
module.exports = {
  plugins: ["react", "react-native"],
  extends: [
    "plugin:@typescript-eslint/recommended",
    "plugin:react/recommended",
    "plugin:react-hooks/recommended",
  ],
  parser: "@typescript-eslint/parser",
  rules: {
    // React-Native Plugin
    // The following rules are made available via `eslint-plugin-react-native`
    "react-native/no-inline-styles": 2,
    "react-native/no-color-literals": 1,
  },
  ignorePatterns: [".eslintrc.cjs", "dist/", "node_modules/"],
  parserOptions: {
    files: ["*.ts", "*.tsx"], // Your TypeScript files extension
    project: ["./tsconfig.json"], // Specify it only for TypeScript files
    tsconfigRootDir: __dirname,
  },
};
