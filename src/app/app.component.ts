import { Component, OnInit } from '@angular/core';
import { DashboardComponent } from '@features/dashboard/dashboard.component';
import { WorkerStatusComponent } from '@features/worker-status/worker-status.component';
import { WorkerLabComponent } from '@features/worker-lab/worker-lab.component';
import { ServiceWorkerService } from '@core/services/service-worker.service';
import { SharedWorkerService } from '@core/services/shared-worker.service';
import { WorkerFacade } from '@core/services/worker-facade.service';

@Component({
  selector: 'dw-root',
  standalone: true,
  imports: [DashboardComponent, WorkerStatusComponent, WorkerLabComponent],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css'],
})
export class AppComponent implements OnInit {
  title = 'DataWorker';

  constructor(
    private readonly swService: ServiceWorkerService,
    private readonly sharedWorkerService: SharedWorkerService,
    private readonly facade: WorkerFacade
  ) {}

  async ngOnInit(): Promise<void> {
    this.swService.register();
    this.sharedWorkerService.connect();
    await this.facade.ensureInitialized();
  }
}
