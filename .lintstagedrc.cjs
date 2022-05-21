module.exports = {
  "src/**/!(*dist)/*.{js,jsx,ts,tsx}": [
    "npx prettier --write"
  ]
}
