#!/usr/bin/env node

import fs from "fs";
import path from "path";
import yargs from "yargs/yargs";
import { hideBin } from "yargs/helpers";
import mime from "mime-types";
import ignore from "ignore";
import clipboard from "clipboardy";

const DEFAULT_IGNORE_DIRS = [
  "__pycache__",
  ".venv",
  "node_modules",
  ".git",
  ".idea",
  ".vscode",
  "build",
  "dist",
  "target",
  ".vs",
  "bin",
  "obj",
  "publish",
];
const DEFAULT_IGNORE_FILES = [
  "poetry.lock",
  "package-lock.json",
  "Cargo.lock",
  ".DS_Store",
  "yarn.lock",
];

// Parse command line arguments using yargs
const argv = yargs(hideBin(process.argv))
  .command(
    "$0 <directory>",
    "Generate a report of directory structure and file contents",
    (yargs) => {
      yargs.positional("directory", {
        describe: "The directory to process",
        type: "string",
      });
    }
  )
  .option("depth", {
    alias: "d",
    type: "number",
    description: "Depth of directory tree to display (-1 for unlimited)",
    default: -1,
  })
  .option("exclude-hidden", {
    type: "boolean",
    description: "Exclude hidden files and directories",
    default: true,
  })
  .option("ignore-dirs", {
    type: "array",
    description: "Additional directories to ignore",
  })
  .option("ignore-files", {
    type: "array",
    description: "Additional files to ignore",
  })
  .option("copconignore", {
    type: "string",
    description: "Path to .copconignore file",
  }).argv;

// Helper to determine if a path should be ignored
function shouldIgnore(ignoreSpec, filePath, rootDir) {
  const relativePath = path
    .relative(rootDir, filePath)
    .split(path.sep)
    .join("/"); // Convert to relative path
  return ignoreSpec.ignores(relativePath);
}

// Recursively generate the directory tree
function generateTree(
  directory,
  depth,
  ignoreSpec,
  currentDepth = 0,
  prefix = "",
  rootDir = directory
) {
  if (depth === 0 || currentDepth > depth) return "";

  const output = [];
  const contents = fs
    .readdirSync(directory)
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));

  contents.forEach((item, index) => {
    const fullPath = path.join(directory, item);
    const isDir = fs.statSync(fullPath).isDirectory();
    const isLast = index === contents.length - 1;
    const currentPrefix = isLast ? "└── " : "├── ";

    if (isDir && DEFAULT_IGNORE_DIRS.includes(item)) return;
    if (!isDir && DEFAULT_IGNORE_FILES.includes(item)) return;
    if (shouldIgnore(ignoreSpec, fullPath, rootDir)) return;

    output.push(prefix + currentPrefix + item);

    if (isDir) {
      const subtreePrefix = isLast ? "    " : "│   ";
      const subtree = generateTree(
        fullPath,
        depth,
        ignoreSpec,
        currentDepth + 1,
        prefix + subtreePrefix,
        rootDir
      );
      if (subtree) output.push(subtree);
    }
  });

  return output.join("\n");
}

// Read the file content or return binary info
function getFileContent(filePath) {
  try {
    const mimeType = mime.lookup(filePath);
    const ext = path.extname(filePath).toLowerCase();

    // List of known text file extensions
    const textFileExtensions = [
      ".js",
      ".json",
      ".txt",
      ".md",
      ".html",
      ".css",
      ".xml",
      ".yml",
      ".yaml",
    ];

    if (
      (mimeType && mimeType.startsWith("text")) || // Check if it's a known text MIME type
      textFileExtensions.includes(ext) // Check if the extension is known to be text
    ) {
      return fs.readFileSync(filePath, "utf8");
    } else {
      const fileSize = fs.statSync(filePath).size;
      return `[Binary file]\nType: ${
        mimeType || "Unknown"
      }\nSize: ${fileSize} bytes`;
    }
  } catch (err) {
    return `Error reading file: ${filePath}\nError: ${err.message}`;
  }
}

// Main function to process the directory
async function main() {
  const directory = path.resolve(argv.directory);
  if (!fs.existsSync(directory) || !fs.statSync(directory).isDirectory()) {
    console.error(`Error: ${directory} is not a valid directory.`);
    process.exit(1);
  }

  const dirsToIgnore = [...DEFAULT_IGNORE_DIRS, ...(argv.ignoreDirs || [])];
  const filesToIgnore = [...DEFAULT_IGNORE_FILES, ...(argv.ignoreFiles || [])];

  let ignoreSpec = ignore().add(dirsToIgnore).add(filesToIgnore);
  if (argv.copconignore && fs.existsSync(argv.copconignore)) {
    const copconignoreContent = fs.readFileSync(argv.copconignore, "utf8");
    ignoreSpec.add(copconignoreContent);
  } else if (fs.existsSync(path.join(directory, ".copconignore"))) {
    const copconignoreContent = fs.readFileSync(
      path.join(directory, ".copconignore"),
      "utf8"
    );
    ignoreSpec.add(copconignoreContent);
  }

  // Generate directory structure
  const treeOutput = generateTree(directory, argv.depth, ignoreSpec);
  let finalOutput = `Directory Structure:\n${path.basename(
    directory
  )}\n${treeOutput}\n\nFile Contents:\n`;

  // Generate file contents
  const allFiles = [];
  function gatherFiles(dir) {
    fs.readdirSync(dir).forEach((file) => {
      const fullPath = path.join(dir, file);
      if (fs.statSync(fullPath).isDirectory()) {
        gatherFiles(fullPath);
      } else {
        allFiles.push(fullPath);
      }
    });
  }

  gatherFiles(directory);

  allFiles.forEach((file) => {
    if (argv.excludeHidden && path.basename(file).startsWith(".")) return;
    if (shouldIgnore(ignoreSpec, file, directory)) return;

    finalOutput += `\nFile: ${path.relative(
      directory,
      file
    )}\n----------------------------------------\n`;
    finalOutput += getFileContent(file);
    finalOutput += `\n----------------------------------------\n`;
  });

  // Dynamically import clipboardy and copy output to clipboard
  clipboard.writeSync(finalOutput);
  console.log(
    "Directory structure and file contents have been copied to clipboard."
  );
}

// Run the program
main();
