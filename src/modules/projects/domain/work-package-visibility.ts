/**
 * Progressive disclosure for work packages (docs 39 §2, 45 §5).
 *
 * The default/general package always exists internally; the UI reveals package
 * management only once the project genuinely has more than one package.
 */
export function shouldShowWorkPackages(activePackageCount: number): boolean {
  return activePackageCount > 1;
}

export function countActiveWorkPackages(
  packages: readonly { archivedAt: Date | null }[],
): number {
  return packages.filter((pkg) => pkg.archivedAt === null).length;
}
