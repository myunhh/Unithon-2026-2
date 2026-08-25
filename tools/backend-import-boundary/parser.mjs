import ts from 'typescript'

function scriptKindFor(fileName) {
  if (fileName.endsWith('.tsx')) return ts.ScriptKind.TSX
  if (fileName.endsWith('.jsx')) return ts.ScriptKind.JSX
  if (fileName.endsWith('.js') || fileName.endsWith('.mjs') || fileName.endsWith('.cjs')) {
    return ts.ScriptKind.JS
  }
  return ts.ScriptKind.TS
}

function literalText(node) {
  return node !== undefined && ts.isStringLiteralLike(node) ? node.text : undefined
}

export function extractModuleSpecifiers(source, fileName = 'module.ts') {
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    scriptKindFor(fileName),
  )
  const edges = []

  const addEdge = (kind, node) => {
    const specifier = literalText(node)
    if (specifier !== undefined) edges.push({ kind, specifier })
  }

  const visit = (node) => {
    if (ts.isImportDeclaration(node)) {
      addEdge(node.importClause?.isTypeOnly ? 'import-type' : 'import', node.moduleSpecifier)
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference)
    ) {
      addEdge(
        node.isTypeOnly ? 'import-equals-type' : 'import-equals',
        node.moduleReference.expression,
      )
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier !== undefined) {
      addEdge(node.isTypeOnly ? 'export-type' : 'export', node.moduleSpecifier)
    } else if (ts.isCallExpression(node)) {
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        addEdge('dynamic-import', node.arguments[0])
      } else if (ts.isIdentifier(node.expression) && node.expression.text === 'require') {
        addEdge('require', node.arguments[0])
      }
    }
    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return edges
}
