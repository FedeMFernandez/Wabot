export class Publication {
  readonly id: string;
  name: string;
  text: string;
  readonly images: string[];

  constructor(id: string, name: string, text: string, images: string[] = []) {
    this.id = id;
    this.name = name;
    this.text = text;
    this.images = images;
  }

  addImage(source: string): void {
    this.images.push(source);
  }

  hasImages(): boolean {
    return this.images.length > 0;
  }
}
