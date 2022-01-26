<p align="center">
    <img width="250" height="250" src="./sb-mig-logo.png" alt="Logo" />
</p>

## Contents

- [sb-mig core](https://github.com/sb-mig/sb-mig/tree/master/%40sb-mig/sb-mig)




## Development
This is Lerna monorepo of CLI build with help of [Meow](https://github.com/sindresorhus/meow) lib. 
It consists of `sb-mig` package which is a core of `sb-mig` CLI.

To successfully run and develop core you have to first run

```
yarn - install dependencies
yarn start - build all packages
```
in root of the repository.

and 

```
yarn link
```
inside `@sb-mig/sb-mig` folder to use local `sb-mig` package.

# !! Important to mention !!
Currently if u modify any of the source code, you have to rebuild that code.
So run

```
yarn start
```
to rebuild everything, or go to desired package, and rebuild only that package.
