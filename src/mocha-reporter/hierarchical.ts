import Mocha from 'mocha';

const {
  EVENT_RUN_BEGIN,
  EVENT_RUN_END,
  EVENT_SUITE_BEGIN,
  EVENT_SUITE_END,
  EVENT_TEST_PASS,
  EVENT_TEST_FAIL,
  EVENT_TEST_PENDING
} = Mocha.Runner.constants;

export interface TestResult {
  title: string;
  fullTitle: string;
  state: 'passed' | 'failed' | 'pending';
  duration?: number;
  error?: {
    message: string;
    stack?: string;
  };
}

export interface SuiteResult {
  title: string;
  fullTitle: string;
  suites: SuiteResult[];
  tests: TestResult[];
}

export interface HierarchicalReport {
  stats: {
    suites: number;
    tests: number;
    passes: number;
    pending: number;
    failures: number;
    start?: string;
    end?: string;
    duration?: number;
  };
  root: SuiteResult;
}

export class HierarchicalReporter extends Mocha.reporters.Base {
  private suiteStack: SuiteResult[] = [];
  private rootSuite: SuiteResult;
  private suiteCount = 0;
  private setResult: (report: HierarchicalReport) => void;

  constructor(runner: Mocha.Runner, options?: Mocha.MochaOptions) {
    super(runner, options);
    this.setResult = options?.reporterOptions?.setResult ?? (() => {});
    this.rootSuite = {
      title: '',
      fullTitle: '',
      suites: [],
      tests: []
    };
    this.suiteStack.push(this.rootSuite);

    runner.once(EVENT_RUN_BEGIN, () => {
      this.suiteCount = 0;
    });

    runner.on(EVENT_SUITE_BEGIN, (suite: Mocha.Suite) => {
      if (suite.root) {
        return;
      }

      this.suiteCount++;

      const suiteResult: SuiteResult = {
        title: suite.title,
        fullTitle: suite.fullTitle(),
        suites: [],
        tests: []
      };

      const currentSuite = this.suiteStack[this.suiteStack.length - 1];
      currentSuite.suites.push(suiteResult);
      this.suiteStack.push(suiteResult);
    });

    runner.on(EVENT_SUITE_END, (suite: Mocha.Suite) => {
      if (suite.root) {
        return;
      }
      this.suiteStack.pop();
    });

    runner.on(EVENT_TEST_PASS, (test: Mocha.Test) => {
      this.addTest(test, 'passed');
    });

    runner.on(EVENT_TEST_FAIL, (test: Mocha.Test, err: Error) => {
      this.addTest(test, 'failed', err);
    });

    runner.on(EVENT_TEST_PENDING, (test: Mocha.Test) => {
      this.addTest(test, 'pending');
    });

    runner.once(EVENT_RUN_END, () => {
      const {stats} = runner;
      const report: HierarchicalReport = {
        stats: {
          suites: this.suiteCount,
          tests: stats?.tests ?? 0,
          passes: stats?.passes ?? 0,
          pending: stats?.pending ?? 0,
          failures: stats?.failures ?? 0,
          start: stats?.start?.toISOString(),
          end: stats?.end?.toISOString(),
          duration: stats?.duration
        },
        root: this.rootSuite
      };

      this.setResult(report);
    });
  }

  private addTest(
    test: Mocha.Test,
    state: 'passed' | 'failed' | 'pending',
    err?: Error
  ): void {
    const currentSuite = this.suiteStack[this.suiteStack.length - 1];
    const testResult: TestResult = {
      title: test.title,
      fullTitle: test.fullTitle(),
      state,
      duration: test.duration
    };

    if (err) {
      testResult.error = {
        message: err.message,
        stack: err.stack
      };
    }

    currentSuite.tests.push(testResult);
  }
}
