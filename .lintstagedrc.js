module.exports = {
  "@sb-mig/**/!(*dist)/*.{js,jsx,ts,tsx}": [
    "npx prettier --write",
    "eslint --fix"
  ]
}
