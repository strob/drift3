Sample transcripts


Moderator: I'd like to introduce to you tonight Marit MacArthur, who will be ...

Marit: This is my poem.

Marit: It begins/
  Poem continues /
  Stanza ends.

Marit: Stanza: start /
  And on /
  And on.

Moderator: Are there any questions?

Q1: Blah...




TODO(rmo): Documentation on speaker diarization input

# Getting windowed output

Open the Javascript Console.
Expand _exactly_ one item in the UI.

Copy the code from "windowed.js" into the console.

Run `get_windowed(window_duration, step_duration)`, adjusting
window_duration and step_duration (both in seconds) as necessary.

Use the "output" variable to dump data however you'd like.

# LZ Complexity

```sh
git clone https://GitHub.com/Naereen/Lempel-Ziv_Complexity
cd Lempel-Ziv_Complexity/src/
make build2
make test     # should pass
sudo make install2  # mv the build/lib*/*.so files where you need them
```



# electron-webpack-quick-start
> A bare minimum project structure to get started developing with [`electron-webpack`](https://github.com/electron-userland/electron-webpack).

Thanks to the power of `electron-webpack` this template comes packed with...

* Use of [`webpack-dev-server`](https://github.com/webpack/webpack-dev-server) for development
* HMR for both `renderer` and `main` processes
* Use of [`babel-preset-env`](https://github.com/babel/babel-preset-env) that is automatically configured based on your `electron` version
* Use of [`electron-builder`](https://github.com/electron-userland/electron-builder) to package and build a distributable electron application

Make sure to check out [`electron-webpack`'s documentation](https://webpack.electron.build/) for more details.

## Getting Started
Simply clone down this reposity, install dependencies, and get started on your application.

The use of the [yarn](https://yarnpkg.com/) package manager is **strongly** recommended, as opposed to using `npm`.

```bash
# create a directory of your choice, and copy template using curl
mkdir new-electron-webpack-project && cd new-electron-webpack-project
curl -fsSL https://github.com/electron-userland/electron-webpack-quick-start/archive/master.tar.gz | tar -xz --strip-components 1

# or copy template using git clone
git clone https://github.com/electron-userland/electron-webpack-quick-start.git
cd electron-webpack-quick-start
rm -rf .git

# install dependencies
yarn
```

### Development Scripts

```bash
# run application in development mode
yarn dev

# compile source code and create webpack output
yarn compile

# `yarn compile` & create build with electron-builder
yarn dist

# `yarn compile` & create unpacked build with electron-builder
yarn dist:dir
```
