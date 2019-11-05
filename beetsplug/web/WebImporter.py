from beets.autotag import Recommendation

from beets import importer, config, plugins
from beets.importer import apply_choice, plugin_stage, manipulate_files, QUEUE_SIZE, ImportAbort, read_tasks, \
    lookup_candidates, SentinelImportTask, SingletonImportTask, action, group_albums, _extend_pipeline
from beets.util import pipeline


@pipeline.stage
def save_or_set_apply_matches(session, task):
    if task.rec == Recommendation.strong:
        task.set_choice(task.candidates[0])
        apply_choice(session, task)
        return task
    # extend pipeline with apply
    if type(task) == SentinelImportTask:
        return task
    task.set_choice(action.SKIP)
    session.tasks.append(task)
    return task


class WebImporter(importer.ImportSession):
    tasks = list()

    def import_task(self, task):
        def emitter():
            yield task

        self.set_config(config['import'])
        apply_choice(self, task)
        stages = [emitter()]
        # Plugin stages
        for stage_func in plugins.early_import_stages():
            stages.append(plugin_stage(self, stage_func))
        for stage_func in plugins.import_stages():
            stages.append(plugin_stage(self, stage_func))

        stages.append(manipulate_files(self))

        pl = pipeline.Pipeline(stages)

        plugins.send('import_begin', session=self)
        if config['threaded']:
            pl.run_parallel(QUEUE_SIZE)
        else:
            pl.run_sequential()

    def run(self):
        self.set_config(config['import'])

        stages = [read_tasks(self), lookup_candidates(self), save_or_set_apply_matches(self)]

        for stage_func in plugins.early_import_stages():
            stages.append(plugin_stage(self, stage_func))
        for stage_func in plugins.import_stages():
            stages.append(plugin_stage(self, stage_func))

        stages.append(manipulate_files(self))

        pl = pipeline.Pipeline(stages)

        plugins.send('import_begin', session=self)
        if config['threaded']:
            pl.run_parallel(QUEUE_SIZE)
        else:
            pl.run_sequential()
