const presets = [
  [
    "@babel/env",
    {
      targets: { node: "current" },
      useBuiltIns: false,
    },
  ],
  "@babel/preset-react",
];

module.exports = { presets };
