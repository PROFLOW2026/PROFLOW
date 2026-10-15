declare namespace Autodesk {
  namespace Viewing {
    function Initializer(
      options: { env: string; useADP?: boolean },
      callback: () => void,
    ): void;

    class GuiViewer3D {
      constructor(container: HTMLElement, config?: unknown);
      start(): void;
      setTheme(theme: string): void;
      loadExtension(id: string): Promise<unknown>;
      loadModel(url: string, options?: { fileExtension?: string }): Promise<unknown>;
      finish(): void;
      tearDown(): void;
    }

    const GEOMETRY_LOADED_EVENT: string;

    namespace Private {
      namespace analytics {
        function disableForPage(): void;
      }
    }
  }
}
