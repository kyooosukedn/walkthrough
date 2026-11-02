import { describe, it, expect } from "vitest";

import { resolvePythonImports, resolveGoImports, goModulePath, goPackageIndex } from "./lang-imports.js";

describe("Python imports", () => {
  const files = new Set([
    "backend/pyproject.toml",
    "backend/app/main.py",
    "backend/app/api/__init__.py",
    "backend/app/api/routes/items.py",
    "backend/app/api/deps.py",
    "backend/app/core/config.py",
    "backend/app/models.py",
  ]);

  it("resolves absolute imports from the nearest package root", () => {
    const got = resolvePythonImports("backend/app/main.py", "from app.core.config import settings\nimport app.models\n", files);
    expect(got.map((r) => r.to)).toEqual(["backend/app/core/config.py", "backend/app/models.py"]);
  });

  it("links 'from pkg import submodule' to the submodule file", () => {
    const got = resolvePythonImports("backend/app/main.py", "from app.api.routes import items\n", files);
    expect(got.map((r) => r.to)).toEqual(["backend/app/api/routes/items.py"]);
  });

  it("resolves relative imports", () => {
    const got = resolvePythonImports("backend/app/api/routes/items.py", "from ..deps import get_db\nfrom ... import models\n", files);
    expect(got.map((r) => r.to)).toEqual(["backend/app/api/deps.py", "backend/app/models.py"]);
  });

  it("reads parenthesised imports, including multi-line", () => {
    const multi = "from app.api.routes import (\n    items,\n)\nfrom app.core import (config, missing)\n";
    const got = resolvePythonImports("backend/app/main.py", multi, files);
    expect(got.map((r) => r.to)).toEqual(["backend/app/api/routes/items.py", "backend/app/core/config.py"]);
  });

  it("does not let a local file shadow a stdlib import (Python 3 has no implicit relative imports)", () => {
    const withLogging = new Set([...files, "backend/app/core/logging.py", "backend/app/__init__.py", "backend/app/core/__init__.py"]);
    expect(resolvePythonImports("backend/app/core/config.py", "import logging\n", withLogging)).toEqual([]);
  });

  it("resolves nothing when relative dots climb past the repo root", () => {
    expect(resolvePythonImports("backend/app/main.py", "from ..... import main\n", files)).toEqual([]);
  });

  it("falls back to the package __init__.py for names defined there", () => {
    const withInit = new Set([...files, "backend/app/__init__.py"]);
    const got = resolvePythonImports("backend/app/api/deps.py", "from .. import settings\n", withInit);
    expect(got.map((r) => r.to)).toEqual(["backend/app/__init__.py"]);
  });

  it("ignores third-party packages", () => {
    expect(resolvePythonImports("backend/app/main.py", "import fastapi\nfrom sqlmodel import Session\n", files)).toEqual([]);
  });
});

describe("Go imports in nested modules", () => {
  it("resolves against the go.mod that owns the import path", () => {
    const index = goPackageIndex(["svc/main.go", "svc/internal/db/db.go"]);
    const src = 'package main\nimport "example.com/svc/internal/db"\n';
    const got = resolveGoImports("svc/main.go", src, [{ path: "example.com/svc", dir: "svc" }], index);
    expect(got.map((r) => r.to)).toEqual(["svc/internal/db/db.go"]);
  });
});

describe("Go imports", () => {
  const files = ["gin.go", "context.go", "binding/binding.go", "binding/json.go", "binding/binding_test.go", "internal/json/json.go"];
  const index = goPackageIndex(files);
  const mod = goModulePath("module github.com/gin-gonic/gin\n\ngo 1.21\n");

  it("reads the module path", () => {
    expect(mod).toBe("github.com/gin-gonic/gin");
  });

  it("resolves in-module package imports (block and single forms)", () => {
    const src = `package gin\n\nimport (\n\t"net/http"\n\t"github.com/gin-gonic/gin/binding"\n\tj "github.com/gin-gonic/gin/internal/json"\n)\n`;
    expect(resolveGoImports("context.go", src, [{ path: mod!, dir: "" }], index).map((r) => r.to)).toEqual(["binding/binding.go", "internal/json/json.go"]);
    const single = `package x\nimport "github.com/gin-gonic/gin/binding"\n`;
    expect(resolveGoImports("context.go", single, [{ path: mod!, dir: "" }], index).map((r) => r.to)).toEqual(["binding/binding.go"]);
  });
});
