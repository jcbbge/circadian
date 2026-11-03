// Hook scripts exit silently under MW_WORKER=1 (workers start clean). Tests
// exercise those scripts as subprocesses, so they must not inherit the marker.
delete process.env.MW_WORKER;
