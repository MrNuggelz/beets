from doctest import SKIP

from beets.autotag import Recommendation

from beets import importer, config, plugins, autotag
from beets.importer import apply_choice, plugin_stage, manipulate_files, \
    QUEUE_SIZE, ImportAbort, read_tasks, \
    lookup_candidates, SentinelImportTask, SingletonImportTask, action, \
    group_albums, _extend_pipeline, resolve_duplicates, _freshen_items, ImportTask
from beets.ui.commands import _summary_judgment, manual_id
from beets.util import pipeline


@pipeline.stage
def save_or_set_apply_matches(session, task):
    if _summary_judgment(task.rec) == importer.action.APPLY:
        resolve_duplicates(session, task)
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

    def __init__(self, lib, loghandler, paths, query):
        super().__init__(lib, loghandler, paths, query)
        self.tasks = list()

    def should_resume(self, path):
        return False

    def choose_match(self, task):
        raise NotImplementedError

    def resolve_duplicate(self, task, found_duplicates):
        if config['import']['quiet']:
            task.set_choice(SKIP)
        else:
            task.found_duplicates = found_duplicates

    def choose_item(self, task):
        raise NotImplementedError

    def choose_candidate(self, task_index, candidate_index):
        task = self.tasks[task_index]
        task.match = task.candidates[candidate_index]

    def merge_duplicates(self, task):
        # def emitter():
        duplicate_items = task.duplicate_items(self.lib)
        _freshen_items(duplicate_items)
        duplicate_paths = [item.path for item in duplicate_items]

        # Record merged paths in the session so they are not reimported
        self.mark_merged(duplicate_paths)

        merged_task = ImportTask(None, task.paths + duplicate_paths,
                                 task.items + duplicate_items)

        self.new_pipeline([merged_task], self.lookup_stages())

        # pl = pipeline.Pipeline([iter([merged_task])] + self.lookup_stages())
        #
        # if config['threaded']:
        #     pl.run_parallel(QUEUE_SIZE)
        # else:
        #     pl.run_sequential()

    def search_id(self, task, search_id):
        if task.is_album:
            _, _, prop = autotag.tag_album(
                task.items, search_ids=search_id.split()
            )
        else:
            prop = autotag.tag_item(task.item, search_ids=search_id.split())
        if len(prop.candidates) > 0:
            task.candidates = prop.candidates
            task.rec = prop.recommendation
        return task

    def search_name(self, task, name, artist):
        if task.is_album:
            _, _, prop = autotag.tag_album(
                task.items, artist, name
            )
        else:
            prop = autotag.tag_item(task.item, artist, name)
        if len(prop.candidates) > 0:
            task.candidates = prop.candidates
            task.rec = prop.recommendation
        return task

    def as_tracks(self, task):
        def emitter(task):
            for item in task.items:
                task = SingletonImportTask(task.toppath, item)
                for new_task in task.handle_created(self):
                    yield new_task
            yield SentinelImportTask(task.toppath, task.paths)

        self.new_pipeline(emitter(task), self.lookup_stages())

        # pl = pipeline.Pipeline([emitter(task)] + self.lookup_stages())
        #
        # if config['threaded']:
        #     pl.run_parallel(QUEUE_SIZE)
        # else:
        #     pl.run_sequential()

    def import_task(self, task):
        # def emitter():
        #     yield task

        self.set_config(config['import'])
        apply_choice(self, task)

        self.new_pipeline([task], self.generate_stages())

        # stages = [emitter()] + self.generate_stages()
        #
        # pl = pipeline.Pipeline(stages)
        #
        # plugins.send('import_begin', session=self)
        # if config['threaded']:
        #     pl.run_parallel(QUEUE_SIZE)
        # else:
        #     pl.run_sequential()
        return True

    def run(self):
        self.set_config(config['import'])

        self.new_pipeline(read_tasks(self), self.lookup_stages())

        # pl = pipeline.Pipeline([read_tasks(self)] + self.lookup_stages())
        #
        # plugins.send('import_begin', session=self)
        # if config['threaded']:
        #     pl.run_parallel(QUEUE_SIZE)
        # else:
        #     pl.run_sequential()

    def resolved_duplicates(self, index):
        self.set_config(config['import'])
        task = self.tasks[index]
        resolve_duplicates(self, task)
        return not hasattr(task, 'found_duplicates')

    def new_pipeline(self, tasks, stages):
        if type(tasks) == list:
            task_iter = iter(tasks)
        else:
            task_iter = tasks

        pl = pipeline.Pipeline([task_iter] + stages)
        plugins.send('import_begin', session=self)
        if config['threaded']:
            pl.run_parallel(QUEUE_SIZE)
        else:
            pl.run_sequential()

    # def run(self):
    #     self.set_config(config['import'])
    #
    #     pl = pipeline.Pipeline([read_tasks(self)] + self.lookup_stages())
    #
    #     plugins.send('import_begin', session=self)
    #     if config['threaded']:
    #         pl.run_parallel(QUEUE_SIZE)
    #     else:
    #         pl.run_sequential()

    def lookup_stages(self):
        return [lookup_candidates(self),
                save_or_set_apply_matches(self)] + self.generate_stages()

    def generate_stages(self):
        stages = []
        for stage_func in plugins.early_import_stages():
            stages.append(plugin_stage(self, stage_func))
        for stage_func in plugins.import_stages():
            stages.append(plugin_stage(self, stage_func))

        stages.append(manipulate_files(self))
        return stages
